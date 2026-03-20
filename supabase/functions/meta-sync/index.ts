import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const ENV_META_ACCESS_TOKEN = Deno.env.get('META_ACCESS_TOKEN') ?? '';
const ENV_META_AD_ACCOUNT_ID = Deno.env.get('META_AD_ACCOUNT_ID') ?? '';

const GRAPH_API = 'https://graph.facebook.com/v19.0';

function getSb() {
  // Prefer service role, fallback to anon
  const key = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
  console.log('[MetaSync] Supabase URL:', SUPABASE_URL ? 'set' : 'MISSING');
  console.log('[MetaSync] Using key:', SUPABASE_SERVICE_ROLE_KEY ? 'service_role' : SUPABASE_ANON_KEY ? 'anon' : 'NONE');
  return createClient(SUPABASE_URL, key);
}

async function getCredentials(sb: any): Promise<{ token: string; accountId: string }> {
  try {
    const { data, error } = await sb.from('meta_conexoes').select('access_token, ad_account_id').limit(1);
    console.log('[MetaSync] DB query result:', JSON.stringify(data), 'error:', JSON.stringify(error));
    const row = data?.[0];
    const token = row?.access_token || ENV_META_ACCESS_TOKEN;
    const accountId = row?.ad_account_id || ENV_META_AD_ACCOUNT_ID;
    console.log('[MetaSync] Resolved:', accountId ? `act_****${accountId.slice(-4)}` : 'NO_ACCOUNT', token ? `token=${token.slice(0,8)}...` : 'NO_TOKEN');
    return { token, accountId };
  } catch (e) {
    console.error('[MetaSync] getCredentials error:', e);
    return { token: ENV_META_ACCESS_TOKEN, accountId: ENV_META_AD_ACCOUNT_ID };
  }
}

interface CampaignInsight {
  spend: string;
  impressions: string;
  clicks: string;
  ctr: string;
  cpc: string;
  reach?: string;
  frequency?: string;
  actions?: Array<{ action_type: string; value: string }>;
  date_start: string;
  date_stop: string;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  effective_status: string;
  daily_budget?: string;
  lifetime_budget?: string;
}

async function fetchCampaigns(accountId: string, token: string): Promise<Campaign[]> {
  const url = `${GRAPH_API}/act_${accountId}/campaigns?fields=name,status,effective_status,daily_budget,lifetime_budget&limit=100&access_token=${token}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(`Meta API: ${data.error.message}`);
  return data.data || [];
}

async function fetchCampaignInsights(campaignId: string, token: string): Promise<CampaignInsight | null> {
  const url = `${GRAPH_API}/${campaignId}/insights?fields=spend,impressions,clicks,ctr,cpc,actions,action_values,reach,frequency&date_preset=last_30d&access_token=${token}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) {
    console.error(`[MetaSync] Insights error for ${campaignId}:`, data.error.message);
    return null;
  }
  return data.data?.[0] || null;
}

const LEAD_ACTIONS = new Set([
  'lead',
  'onsite_conversion.lead_grouped',
  'offsite_conversion.fb_pixel_lead',
  'onsite_conversion.flow_complete'
]);
const MSG_ACTIONS = new Set([
  'onsite_conversion.messaging_conversation_started_7d',
  'onsite_conversion.messaging_first_reply',
  'onsite_conversion.post_save',
  'omni_initiated_checkout'
]);

function extractLeadsAndMessages(actions?: Array<{ action_type: string; value: string }>): { leads: number; messages: number } {
  if (!actions) return { leads: 0, messages: 0 };
  let leads = 0, messages = 0;
  for (const a of actions) {
    const v = parseInt(a.value) || 0;
    if (LEAD_ACTIONS.has(a.action_type)) leads += v;
    else if (MSG_ACTIONS.has(a.action_type)) messages += v;
  }
  console.log('[MetaSync] Actions parsed:', actions.map(a => `${a.action_type}=${a.value}`).join(', '), `→ leads=${leads}, msgs=${messages}`);
  return { leads, messages };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      }
    });
  }

  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  try {
    console.log('[MetaSync] === START ===');
    const sb = getSb();
    const { token, accountId } = await getCredentials(sb);

    if (!token || !accountId) {
      console.log('[MetaSync] FAIL: missing credentials');
      return new Response(JSON.stringify({
        error: 'Credenciais Meta não configuradas. Preencha na aba Conexão Meta ou nos Secrets do Supabase.'
      }), { status: 400, headers });
    }

    console.log(`[MetaSync] Fetching campaigns for act_****${accountId.slice(-4)}...`);
    const campaigns = await fetchCampaigns(accountId, token);
    console.log(`[MetaSync] Found ${campaigns.length} campaigns`);

    const results = [];
    const now = new Date().toISOString();

    for (const camp of campaigns) {
      const insights = await fetchCampaignInsights(camp.id, token);

      const spend = insights ? parseFloat(insights.spend) || 0 : 0;
      const impressions = insights ? parseInt(insights.impressions) || 0 : 0;
      const clicks = insights ? parseInt(insights.clicks) || 0 : 0;
      const ctr = insights ? parseFloat(insights.ctr) || 0 : 0;
      const cpc = insights ? parseFloat(insights.cpc) || 0 : 0;
      const { leads, messages } = insights ? extractLeadsAndMessages(insights.actions) : { leads: 0, messages: 0 };
      const cpl = leads > 0 ? spend / leads : 0;

      const row = {
        campaign_id: camp.id,
        nome: camp.name,
        status: camp.effective_status || camp.status,
        budget_diario: camp.daily_budget ? parseFloat(camp.daily_budget) / 100 : null,
        budget_total: camp.lifetime_budget ? parseFloat(camp.lifetime_budget) / 100 : null,
        gasto: spend,
        impressoes: impressions,
        cliques: clicks,
        ctr: ctr,
        cpc: cpc,
        conversoes: leads,
        messages_count: messages,
        data_inicio: insights?.date_start || null,
        data_fim: insights?.date_stop || null,
        sincronizado_em: now
      };

      const { error } = await sb
        .from('meta_campanhas_cache')
        .upsert(row, { onConflict: 'campaign_id' });

      if (error) {
        console.error(`[MetaSync] Upsert error for ${camp.name}:`, error.message);
      }

      results.push({
        name: camp.name,
        status: camp.effective_status,
        spend, leads, cpl: cpl.toFixed(2), ctr: ctr.toFixed(2)
      });

      console.log(`[MetaSync] ${camp.name}: R$${spend.toFixed(2)}, ${leads} leads`);
    }

    // Update connection status
    await sb.from('meta_conexoes').update({
      status: 'conectado',
      last_sync_at: now,
      campaigns_count: results.length
    }).eq('ad_account_id', accountId);

    console.log(`[MetaSync] === DONE: ${results.length} campaigns synced ===`);

    return new Response(JSON.stringify({
      synced: results.length,
      timestamp: now,
      campaigns: results
    }), { headers });

  } catch (err) {
    console.error('[MetaSync] FATAL:', err.message, err.stack);
    return new Response(JSON.stringify({
      error: err.message
    }), { status: 500, headers });
  }
});
