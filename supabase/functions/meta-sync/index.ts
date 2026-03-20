import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const ENV_META_ACCESS_TOKEN = Deno.env.get('META_ACCESS_TOKEN') ?? '';
const ENV_META_AD_ACCOUNT_ID = Deno.env.get('META_AD_ACCOUNT_ID') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const GRAPH_API = 'https://graph.facebook.com/v19.0';

// Resolve credentials: table first, env secrets as fallback
async function getCredentials(sb: any): Promise<{ token: string; accountId: string }> {
  const { data } = await sb.from('meta_conexoes').select('access_token, ad_account_id').eq('ativo', true).limit(1).single();
  const token = data?.access_token || ENV_META_ACCESS_TOKEN;
  const accountId = data?.ad_account_id || ENV_META_AD_ACCOUNT_ID;
  return { token, accountId };
}

interface CampaignInsight {
  spend: string;
  impressions: string;
  clicks: string;
  ctr: string;
  cpc: string;
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
  const url = `${GRAPH_API}/${campaignId}/insights?fields=spend,impressions,clicks,ctr,cpc,actions&date_preset=last_30d&access_token=${token}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) {
    console.error(`[MetaSync] Insights error for ${campaignId}:`, data.error.message);
    return null;
  }
  return data.data?.[0] || null;
}

function extractLeads(actions?: Array<{ action_type: string; value: string }>): number {
  if (!actions) return 0;
  const lead = actions.find(a =>
    a.action_type === 'lead' ||
    a.action_type === 'onsite_conversion.lead_grouped' ||
    a.action_type === 'offsite_conversion.fb_pixel_lead'
  );
  return lead ? parseInt(lead.value) || 0 : 0;
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
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { token, accountId } = await getCredentials(sb);

    if (!token || !accountId) {
      return new Response(JSON.stringify({
        error: 'Credenciais Meta não configuradas. Preencha na aba Conexão Meta ou nos Secrets do Supabase.'
      }), { status: 400, headers });
    }

    console.log(`[MetaSync] Using account: act_****${accountId.slice(-4)}`);
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
      const leads = insights ? extractLeads(insights.actions) : 0;
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
        data_inicio: insights?.date_start || null,
        data_fim: insights?.date_stop || null,
        sincronizado_em: now
      };

      // Upsert by campaign_id
      const { error } = await sb
        .from('meta_campanhas_cache')
        .upsert(row, { onConflict: 'campaign_id' });

      if (error) {
        console.error(`[MetaSync] Upsert error for ${camp.name}:`, error.message);
        // Try insert if upsert fails (no unique constraint)
        const { error: insertErr } = await sb
          .from('meta_campanhas_cache')
          .insert(row);
        if (insertErr) console.error(`[MetaSync] Insert fallback error:`, insertErr.message);
      }

      results.push({
        name: camp.name,
        status: camp.effective_status,
        spend, leads, cpl: cpl.toFixed(2), ctr: ctr.toFixed(2)
      });

      console.log(`[MetaSync] ${camp.name}: R$${spend.toFixed(2)}, ${leads} leads, CPL R$${cpl.toFixed(2)}`);
    }

    // Update meta_conexoes status
    await sb.from('meta_conexoes').update({
      status: 'conectado',
      last_sync_at: now,
      campaigns_count: results.length
    }).eq('ad_account_id', accountId);

    return new Response(JSON.stringify({
      synced: results.length,
      timestamp: now,
      campaigns: results
    }), { headers });

  } catch (err) {
    console.error('[MetaSync] Error:', err);
    return new Response(JSON.stringify({
      error: err.message
    }), { status: 500, headers });
  }
});
