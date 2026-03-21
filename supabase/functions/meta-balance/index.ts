import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const GRAPH_API = 'https://graph.facebook.com/v21.0';

function getSb() { return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY); }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } });
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  try {
    const sb = getSb();

    // Get credentials from DB
    const { data } = await sb.from('meta_conexoes').select('access_token, ad_account_id').limit(1);
    const row = data?.[0];
    if (!row?.access_token || !row?.ad_account_id) {
      return new Response(JSON.stringify({ error: 'Credenciais Meta não configuradas.' }), { status: 400, headers });
    }

    // Fetch account balance from Meta — fast, single API call
    const res = await fetch(`${GRAPH_API}/act_${row.ad_account_id}?fields=balance,amount_spent,spend_cap,currency,name&access_token=${row.access_token}`);
    const acct = await res.json();

    if (acct.error) {
      return new Response(JSON.stringify({ error: acct.error.message }), { status: 400, headers });
    }

    // Meta returns balance/amount_spent in cents (integer strings)
    const balance = acct.balance ? parseFloat(acct.balance) / 100 : 0;
    const amountSpent = acct.amount_spent ? parseFloat(acct.amount_spent) / 100 : 0;
    const spendCap = acct.spend_cap ? parseFloat(acct.spend_cap) / 100 : 0;

    // Update cedtec_conta_meta with real balance
    const { data: contaMeta } = await sb.from('cedtec_conta_meta').select('id').limit(1);
    if (contaMeta?.[0]) {
      await sb.from('cedtec_conta_meta').update({
        saldo_atual: balance,
        limite: spendCap > 0 ? spendCap : (balance + amountSpent),
        atualizado_em: new Date().toISOString()
      }).eq('id', contaMeta[0].id);
    }

    return new Response(JSON.stringify({
      balance,
      amount_spent: amountSpent,
      spend_cap: spendCap,
      currency: acct.currency || 'BRL',
      account_name: acct.name || '',
      updated_at: new Date().toISOString()
    }), { headers });

  } catch (err) {
    console.error('[MetaBalance] Error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
});
