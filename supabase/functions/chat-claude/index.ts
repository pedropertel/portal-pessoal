import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const MODEL = 'claude-haiku-4-5-20251001';

// ── SYSTEM PROMPTS POR DOMÍNIO ──────────────────────────
const SYSTEM_PROMPTS: Record<string, string> = {
  tarefas: `Você é o assistente de tarefas do Pedro Pertel (Vitória-ES).
Gerencie o kanban de tarefas. Empresas: Pincel Atômico, CEDTEC, Gráfica, Agência de Marketing, Sítio Monte da Vitória.
Ao criar tarefa, SEMPRE inclua o bloco de ação no final.
Prioridades: baixa, media, alta, urgente.

Formato OBRIGATÓRIO para criar tarefa:
[ACTION: {"type":"tarefa","dados":{"titulo":"título aqui","prioridade":"media","data":null}}]

Seja direto e objetivo. Use português brasileiro informal.`,

  agenda: `Você é o assistente de agenda do Pedro Pertel (Vitória-ES).
Gerencie eventos e compromissos. Ao criar evento, SEMPRE inclua o bloco de ação no final.

Formato OBRIGATÓRIO para criar evento:
[ACTION: {"type":"evento","dados":{"titulo":"título","data_inicio":"2026-03-20T10:00:00","descricao":""}}]

Seja direto e objetivo. Use português brasileiro informal.`,

  grafica: `Você é o gestor da Gráfica do Pedro Pertel em Vitória-ES.
A gráfica produz apostilas e materiais impressos. Gerencie pedidos parcelados por cidade e conciliação bancária.
Tabelas disponíveis: grafica_pedidos, grafica_parcelas, grafica_extratos, grafica_conciliacao.
Ao registrar gasto, use o bloco de ação.

Formato para registrar gasto:
[ACTION: {"type":"gasto","dados":{"descricao":"descrição","valor":0.0}}]

Seja direto e objetivo. Use português brasileiro informal.`,

  sitio: `Você é o gestor do Sítio Monte da Vitória do Pedro Pertel.
Propriedade em Pedra Azul-ES com lavoura de café arábica.
Gerencie lançamentos financeiros, gastos, planejamento de safra e manutenção.
Tabelas disponíveis: sitio_categorias, sitio_lancamentos.
Ao registrar gasto, use o bloco de ação.

Formato para registrar gasto:
[ACTION: {"type":"gasto","dados":{"descricao":"descrição","valor":0.0}}]

Seja direto e objetivo. Use português brasileiro informal.`,

  geral: `Você é o assistente pessoal e de negócios do Pedro Pertel, baseado em Vitória-ES, Brasil.

Empresas do Pedro:
1. Pincel Atômico — gestão escolar (marketing/vendas)
2. Agência de Marketing — dono
3. CEDTEC — escola técnica em Vila Velha-ES (marketing e Meta Ads)
4. Gráfica — apostilas, receitas parceladas por cidade, conciliação bancária
5. Sítio Monte da Vitória — Pedra Azul-ES, lavoura de café arábica

Quando o usuário pedir para criar uma tarefa, evento ou registrar um gasto, SEMPRE inclua ao final da sua resposta o bloco de ação abaixo.

Formato OBRIGATÓRIO para criar tarefa:
[ACTION: {"type":"tarefa","dados":{"titulo":"título aqui","prioridade":"media","data":null}}]

Formato para criar evento:
[ACTION: {"type":"evento","dados":{"titulo":"título","data_inicio":"2026-03-20T10:00:00","descricao":""}}]

Formato para registrar gasto:
[ACTION: {"type":"gasto","dados":{"descricao":"descrição","valor":0.0}}]

Prioridades: baixa, media, alta, urgente
Seja direto e objetivo. Use português brasileiro informal.`
};

// ── CLASSIFICADOR (etapa 1) ─────────────────────────────
async function classifyDomain(lastMessage: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 20,
      messages: [{
        role: 'user',
        content: `Classifique a mensagem abaixo em EXATAMENTE UMA palavra: tarefas | agenda | grafica | sitio | geral\n\nMensagem: ${lastMessage}`
      }]
    })
  });

  const data = await res.json();
  const raw = (data.content?.[0]?.text ?? 'geral').trim().toLowerCase();
  const valid = ['tarefas', 'agenda', 'grafica', 'sitio', 'geral'];
  const found = valid.find(v => raw.includes(v));
  console.log(`[Dispatch] Classificação: "${raw}" → ${found || 'geral'}`);
  return found || 'geral';
}

// ── RESPOSTA ESPECIALIZADA (etapa 2) ────────────────────
async function getSpecializedResponse(messages: Array<{role: string, content: string}>, domain: string): Promise<{text: string}> {
  const systemPrompt = SYSTEM_PROMPTS[domain] || SYSTEM_PROMPTS.geral;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages.slice(-20)
    })
  });

  const data = await res.json();
  if (!res.ok) {
    console.error('[Dispatch] Anthropic error:', data);
    throw new Error(data.error?.message || 'Erro na API Anthropic');
  }

  return { text: data.content?.[0]?.text ?? '' };
}

// ── HANDLER PRINCIPAL ───────────────────────────────────
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
    const { messages } = await req.json();

    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ reply: '⚠️ Chave ANTHROPIC_API_KEY não configurada.', agente: 'geral' }), { headers });
    }

    if (!messages || !messages.length) {
      return new Response(JSON.stringify({ reply: '⚠️ Nenhuma mensagem enviada.', agente: 'geral' }), { headers });
    }

    // ETAPA 1: Classificar domínio com a última mensagem do usuário
    const lastUserMsg = [...messages].reverse().find((m: {role: string}) => m.role === 'user');
    const lastText = lastUserMsg?.content || '';
    const domain = await classifyDomain(lastText);

    // ETAPA 2: Resposta especializada
    const { text: fullText } = await getSpecializedResponse(messages, domain);
    console.log(`[Dispatch] Agente: ${domain} | Resposta: ${fullText.substring(0, 100)}...`);

    // Parse ACTION block
    const actionMatch = fullText.match(/\[ACTION:\s*({[\s\S]*?})\]/);
    const cleanReply = fullText.replace(/\[ACTION:[\s\S]*?\]/g, '').trim();

    let action = null, actionData = null;
    if (actionMatch) {
      try {
        const parsed = JSON.parse(actionMatch[1]);
        action = parsed.type;
        actionData = parsed.dados;
        console.log('[Dispatch] Action:', action, actionData);
      } catch (e) {
        console.error('[Dispatch] Erro parseando action:', e, actionMatch[1]);
      }
    }

    return new Response(
      JSON.stringify({ reply: cleanReply || 'Mensagem processada.', action, actionData, agente: domain }),
      { headers }
    );

  } catch (err) {
    console.error('[Dispatch] Erro geral:', err);
    return new Response(
      JSON.stringify({ reply: 'Erro interno: ' + err.message, agente: 'geral' }),
      { status: 500, headers }
    );
  }
});
