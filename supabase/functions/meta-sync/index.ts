import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const ENV_META_ACCESS_TOKEN = Deno.env.get('META_ACCESS_TOKEN') ?? '';
const ENV_META_AD_ACCOUNT_ID = Deno.env.get('META_AD_ACCOUNT_ID') ?? '';
const GRAPH_API = 'https://graph.facebook.com/v19.0';

function getSb() { return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY); }

async function getCredentials(sb: any) {
  try {
    const { data } = await sb.from('meta_conexoes').select('access_token, ad_account_id').limit(1);
    const row = data?.[0];
    return { token: row?.access_token || ENV_META_ACCESS_TOKEN, accountId: row?.ad_account_id || ENV_META_AD_ACCOUNT_ID };
  } catch { return { token: ENV_META_ACCESS_TOKEN, accountId: ENV_META_AD_ACCOUNT_ID }; }
}

const CAMPAIGN_FIELDS = 'name,status,effective_status,objective,daily_budget,lifetime_budget,budget_remaining,start_time,stop_time,created_time';
const INSIGHT_FIELDS = 'spend,impressions,reach,frequency,clicks,unique_clicks,ctr,cpc,cpm,cpp,actions,action_values,cost_per_action_type,video_play_actions,video_avg_time_watched_actions,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p95_watched_actions,quality_ranking,engagement_rate_ranking,conversion_rate_ranking,outbound_clicks,outbound_clicks_ctr,website_ctr,unique_outbound_clicks';

async function fetchMeta(url: string, token: string) {
  const res = await fetch(`${url}&access_token=${token}`);
  const data = await res.json();
  if (data.error) throw new Error(`Meta API: ${data.error.message}`);
  return data;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } });
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  try {
    const sb = getSb();
    const { token, accountId } = await getCredentials(sb);
    if (!token || !accountId) return new Response(JSON.stringify({ error: 'Credenciais Meta não configuradas.' }), { status: 400, headers });

    // Fetch account balance + spend
    let accountBalance = 0, accountSpent = 0, spendCap = 0;
    try {
      const acctData = await fetchMeta(`${GRAPH_API}/act_${accountId}?fields=balance,amount_spent,spend_cap,currency`, token);
      // Meta returns balance in cents (integer)
      accountBalance = acctData.balance ? parseFloat(acctData.balance) / 100 : 0;
      accountSpent = acctData.amount_spent ? parseFloat(acctData.amount_spent) / 100 : 0;
      spendCap = acctData.spend_cap ? parseFloat(acctData.spend_cap) / 100 : 0;
      console.log(`[MetaSync] Account: balance=${accountBalance} spent=${accountSpent} cap=${spendCap}`);
    } catch (e) { console.error('[MetaSync] Account balance error:', e.message); }

    // Fetch campaigns
    const campData = await fetchMeta(`${GRAPH_API}/act_${accountId}/campaigns?fields=${CAMPAIGN_FIELDS}&limit=100`, token);
    const campaigns = campData.data || [];
    console.log(`[MetaSync] ${campaigns.length} campaigns`);

    const results = [];
    const now = new Date().toISOString();

    for (const camp of campaigns) {
      // Insights
      let insights = null;
      try {
        const insData = await fetchMeta(`${GRAPH_API}/${camp.id}/insights?fields=${INSIGHT_FIELDS}&date_preset=last_30d`, token);
        insights = insData.data?.[0] || null;
      } catch (e) { console.error(`[MetaSync] Insights error ${camp.name}:`, e.message); }

      // Adsets
      let adsets = [];
      try {
        const adsetData = await fetchMeta(`${GRAPH_API}/${camp.id}/adsets?fields=name,status,targeting,daily_budget,optimization_goal,bid_strategy&limit=50`, token);
        adsets = adsetData.data || [];
      } catch (e) { console.error(`[MetaSync] Adsets error ${camp.name}:`, e.message); }

      // Ads/Criativos
      let ads = [];
      try {
        const adsData = await fetchMeta(`${GRAPH_API}/${camp.id}/ads?fields=name,creative{title,body,image_url,video_id,call_to_action_type}&limit=50`, token);
        ads = adsData.data || [];
      } catch (e) { console.error(`[MetaSync] Ads error ${camp.name}:`, e.message); }

      // Extract key metrics from actions (no classification — raw preserved in raw_data)
      const actions = insights?.actions || [];
      let leads = 0, messages = 0;
      for (const a of actions) {
        const v = parseInt(a.value) || 0;
        if (['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead', 'onsite_conversion.flow_complete'].includes(a.action_type)) leads += v;
        if (['onsite_conversion.messaging_conversation_started_7d', 'onsite_conversion.messaging_first_reply', 'onsite_conversion.post_save', 'omni_initiated_checkout'].includes(a.action_type)) messages += v;
      }

      const spend = insights ? parseFloat(insights.spend) || 0 : 0;
      const impressions = insights ? parseInt(insights.impressions) || 0 : 0;
      const clicks = insights ? parseInt(insights.clicks) || 0 : 0;
      const ctr = insights ? parseFloat(insights.ctr) || 0 : 0;
      const cpc = insights ? parseFloat(insights.cpc) || 0 : 0;
      const reach = insights ? parseInt(insights.reach) || 0 : 0;
      const frequency = insights ? parseFloat(insights.frequency) || 0 : 0;

      // Build raw_data with EVERYTHING
      const raw_data = {
        campaign: camp,
        insights: insights,
        adsets: adsets,
        ads: ads
      };

      const row = {
        campaign_id: camp.id,
        nome: camp.name,
        status: camp.effective_status || camp.status,
        objetivo: camp.objective || null,
        budget_diario: camp.daily_budget ? parseFloat(camp.daily_budget) / 100 : null,
        budget_total: camp.lifetime_budget ? parseFloat(camp.lifetime_budget) / 100 : null,
        gasto: spend,
        impressoes: impressions,
        cliques: clicks,
        ctr, cpc,
        reach, frequency,
        conversoes: leads,
        messages_count: messages,
        data_inicio: insights?.date_start || camp.start_time?.split('T')[0] || null,
        data_fim: insights?.date_stop || camp.stop_time?.split('T')[0] || null,
        sincronizado_em: now,
        raw_data
      };

      await sb.from('meta_campanhas_cache').upsert(row, { onConflict: 'campaign_id' });
      results.push({ name: camp.name, status: camp.effective_status, spend, leads, messages, reach, frequency, adsets: adsets.length, ads: ads.length });
      console.log(`[MetaSync] ${camp.name}: R$${spend.toFixed(0)} ${leads}L ${messages}M ${reach}R ${adsets.length}AS ${ads.length}AD`);
    }

    await sb.from('meta_conexoes').update({ status: 'conectado', last_sync_at: now, campaigns_count: results.length }).eq('ad_account_id', accountId);

    // Update cedtec_conta_meta with real data from Meta account
    const totalGastoMes = results.reduce((s, c) => s + (c.spend || 0), 0);
    const gastoHoje = totalGastoMes > 0 ? Math.round(totalGastoMes / 30 * 10) / 10 : 0;
    const { data: contaMeta } = await sb.from('cedtec_conta_meta').select('id').limit(1);
    if (contaMeta?.[0]) {
      await sb.from('cedtec_conta_meta').update({
        saldo_atual: accountBalance,
        gasto_mes: totalGastoMes,
        gasto_hoje: gastoHoje,
        limite: spendCap > 0 ? spendCap : (accountBalance + accountSpent),
        atualizado_em: now
      }).eq('id', contaMeta[0].id);
    }

    return new Response(JSON.stringify({ synced: results.length, timestamp: now, campaigns: results, gasto_mes: totalGastoMes, saldo: accountBalance, amount_spent: accountSpent }), { headers });
  } catch (err) {
    console.error('[MetaSync] Error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
});
