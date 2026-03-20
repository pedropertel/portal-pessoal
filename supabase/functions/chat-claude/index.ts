import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const MODEL = 'claude-haiku-4-5-20251001';

// ── HORÁRIO DE BRASÍLIA ──────────────────────────────────
function getNowBrasilia(): { iso: string; display: string; date: string; time: string } {
  const now = new Date();
  // UTC-3
  const br = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const iso = br.toISOString().replace('Z', '-03:00');
  const date = br.toISOString().split('T')[0];
  const time = br.toISOString().split('T')[1].slice(0, 5);
  const dias = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const display = `${dias[br.getDay()]}, ${date} às ${time} (Brasília)`;
  return { iso, display, date, time };
}

const DATE_INSTRUCTION = `
IMPORTANTE sobre datas:
- Agora são: {NOW}
- SEMPRE retorne datas no formato ISO 8601: YYYY-MM-DDTHH:MM:SS (ex: 2026-03-20T14:00:00)
- Para datas sem hora, use YYYY-MM-DD (ex: 2026-03-20)
- NUNCA use 'hoje', 'amanhã', 'segunda' etc — converta para a data real baseada no horário atual acima
- 'hoje' = {DATE}, 'amanhã' = dia seguinte, 'hoje 22h' = {DATE}T22:00:00
- Datas brasileiras (DD/MM/AAAA) devem ser convertidas para YYYY-MM-DD`;

function getDateInstruction(): string {
  const n = getNowBrasilia();
  return DATE_INSTRUCTION
    .replace('{NOW}', n.display)
    .replace(/{DATE}/g, n.date);
}

// ── SYSTEM PROMPTS POR DOMÍNIO ──────────────────────────
function getSystemPrompts(): Record<string, string> {
  const di = getDateInstruction();
  return {
    tarefas: `Você é o assistente de tarefas do Pedro Pertel (Vitória-ES).
Gerencie o kanban de tarefas. Empresas: Pincel Atômico, CEDTEC, Gráfica, Agência de Marketing, Sítio Monte da Vitória.
Ao criar tarefa, SEMPRE inclua o bloco de ação no final.
Prioridades: baixa, media, alta, urgente.

Formato OBRIGATÓRIO para criar tarefa:
[ACTION: {"type":"tarefa","dados":{"titulo":"título aqui","prioridade":"media","data":"YYYY-MM-DD","lembrete_em":"YYYY-MM-DDTHH:MM:SS"}}]

O campo "data" é a data de vencimento. O campo "lembrete_em" é opcional — use se o usuário pedir lembrete.
${di}
Seja direto e objetivo. Use português brasileiro informal.`,

    cedtec: `Você gerencia o comercial do CEDTEC, escola técnica em Vila Velha-ES do Pedro Pertel.
Cursos: Técnico em Informática, Técnico em Enfermagem, Técnico em Administração, e outros cadastrados.
Funil SGE: inscritos → pendentes → matriculados.
Quando o usuário colar dados do SGE, extraia: curso, inscritos, pendentes, matriculados, período.
Retorne o bloco de ação para importar:
[ACTION: {"type":"sge_import","dados":{"curso":"nome","inscritos":0,"pendentes":0,"matriculados":0,"periodo":"2026/1"}}]
Quando perguntado sobre saldo Meta, custo por lead ou conversão, responda com base nos dados disponíveis.
${di}
Seja direto e objetivo. Use português brasileiro informal.`,

    agenda: `Você é o assistente de agenda do Pedro Pertel (Vitória-ES).
Gerencie eventos e compromissos. Ao criar evento, SEMPRE inclua o bloco de ação no final.

Formato OBRIGATÓRIO para criar evento:
[ACTION: {"type":"evento","dados":{"titulo":"título","data_inicio":"YYYY-MM-DDTHH:MM:SS","descricao":""}}]
${di}
Seja direto e objetivo. Use português brasileiro informal.`,

    grafica: `Você é o gestor da Gráfica do Pedro Pertel em Vitória-ES.
A gráfica produz apostilas e materiais impressos. Gerencie pedidos parcelados por cidade e conciliação bancária.
Tabelas disponíveis: grafica_pedidos, grafica_parcelas, grafica_extratos, grafica_conciliacao.
Ao registrar gasto, use o bloco de ação.

Formato para registrar gasto:
[ACTION: {"type":"gasto","dados":{"descricao":"descrição","valor":0.0,"data":"YYYY-MM-DD","centro_custo":"Gráfica"}}]
${di}
Seja direto e objetivo. Use português brasileiro informal.`,

    sitio: `Você é o gestor do Sítio Monte da Vitória do Pedro Pertel.
Propriedade em Pedra Azul-ES com lavoura de café arábica.
Gerencie lançamentos financeiros, gastos, planejamento de safra e manutenção.
Tabelas disponíveis: sitio_categorias, sitio_lancamentos.
Centros de custo existentes: Terreno, Casa sede, Infraestrutura geral, Lavoura - Café arábica, Lavoura - Azeitona, Galpão / tulha.
Ao registrar gasto, use o bloco de ação com o centro de custo mais adequado.

Formato para registrar gasto:
[ACTION: {"type":"gasto","dados":{"descricao":"descrição","valor":0.0,"data":"YYYY-MM-DD","centro_custo":"Lavoura - Café arábica"}}]

O centro_custo DEVE ser um dos nomes listados acima. Escolha o mais adequado ao contexto.
${di}
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
[ACTION: {"type":"tarefa","dados":{"titulo":"título aqui","prioridade":"media","data":"YYYY-MM-DD"}}]

Formato para criar evento:
[ACTION: {"type":"evento","dados":{"titulo":"título","data_inicio":"YYYY-MM-DDTHH:MM:SS","descricao":""}}]

Formato para registrar gasto:
[ACTION: {"type":"gasto","dados":{"descricao":"descrição","valor":0.0,"data":"YYYY-MM-DD","centro_custo":"nome do centro"}}]

Centros de custo do sítio: Terreno, Casa sede, Infraestrutura geral, Lavoura - Café arábica, Lavoura - Azeitona, Galpão / tulha.
Prioridades: baixa, media, alta, urgente
${di}
Seja direto e objetivo. Use português brasileiro informal.`
  };
}

// ── PÓS-PROCESSAMENTO DE DATAS ──────────────────────────
const DATE_FIELDS = ['data', 'data_vencimento', 'lembrete_em', 'data_inicio', 'data_fim', 'data_prevista', 'data_realizada'];

function normalizeDate(val: string): string | null {
  if (!val || typeof val !== 'string') return null;
  const v = val.trim().toLowerCase();

  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v;

  const now = new Date();
  const brNow = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const today = brNow.toISOString().split('T')[0];
  const tomorrow = new Date(brNow.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Extract time if present (e.g., "hoje 22h", "amanhã 9h30", "hoje às 14:00")
  const timeMatch = v.match(/(\d{1,2})[h:](\d{0,2})/);
  const time = timeMatch ? `T${timeMatch[1].padStart(2, '0')}:${(timeMatch[2] || '00').padStart(2, '0')}:00` : '';

  if (v.startsWith('hoje')) return today + time;
  if (v.startsWith('amanh')) return tomorrow + time;

  // DD/MM/AAAA or DD-MM-AAAA or DD.MM.AAAA
  const brMatch = v.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if (brMatch) {
    const day = brMatch[1].padStart(2, '0');
    const month = brMatch[2].padStart(2, '0');
    let year = brMatch[3];
    if (year.length === 2) year = (parseInt(year) > 50 ? '19' : '20') + year;
    return `${year}-${month}-${day}${time}`;
  }

  // Day names (segunda, terça, etc.)
  const dias: Record<string, number> = { domingo: 0, segunda: 1, terca: 2, terça: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6, sábado: 6 };
  for (const [name, dayIdx] of Object.entries(dias)) {
    if (v.includes(name)) {
      const diff = (dayIdx - brNow.getDay() + 7) % 7 || 7;
      const target = new Date(brNow.getTime() + diff * 24 * 60 * 60 * 1000);
      return target.toISOString().split('T')[0] + time;
    }
  }

  console.log(`[DateNorm] Could not parse: "${val}"`);
  return val; // Return as-is if can't parse
}

function postProcessActionData(data: Record<string, unknown>): Record<string, unknown> {
  if (!data || typeof data !== 'object') return data;
  const result = { ...data };
  for (const field of DATE_FIELDS) {
    if (result[field] && typeof result[field] === 'string') {
      const normalized = normalizeDate(result[field] as string);
      if (normalized) {
        console.log(`[DateNorm] ${field}: "${result[field]}" → "${normalized}"`);
        result[field] = normalized;
      }
    }
  }
  return result;
}

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
        content: `Classifique a mensagem abaixo em EXATAMENTE UMA palavra: tarefas | agenda | grafica | sitio | cedtec | geral\n\nMensagem: ${lastMessage}`
      }]
    })
  });

  const data = await res.json();
  const raw = (data.content?.[0]?.text ?? 'geral').trim().toLowerCase();
  const valid = ['tarefas', 'agenda', 'grafica', 'sitio', 'cedtec', 'geral'];
  const found = valid.find(v => raw.includes(v));
  console.log(`[Dispatch] Classificação: "${raw}" → ${found || 'geral'}`);
  return found || 'geral';
}

// ── RESPOSTA ESPECIALIZADA (etapa 2) ────────────────────
async function getSpecializedResponse(messages: Array<{role: string, content: string}>, domain: string): Promise<{text: string}> {
  const prompts = getSystemPrompts();
  const systemPrompt = prompts[domain] || prompts.geral;

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
    const body = await req.json();
    const { messages, marcos, marcosPersona, marcosContext } = body;

    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ reply: '⚠️ Chave ANTHROPIC_API_KEY não configurada.', agente: 'geral' }), { headers });
    }

    if (!messages || !messages.length) {
      return new Response(JSON.stringify({ reply: '⚠️ Nenhuma mensagem enviada.', agente: 'geral' }), { headers });
    }

    let domain: string;
    let fullText: string;

    if (marcos) {
      // MARCOS MODE: skip dispatch, use persona directly
      domain = 'marcos';
      const di = getDateInstruction();
      const systemPrompt = (marcosPersona || 'Você é Marcos, gestor de tráfego pago.') + '\n' + di + (marcosContext ? '\n\n' + marcosContext : '');
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: MODEL, max_tokens: 1500, system: systemPrompt, messages: messages.slice(-20) })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Erro na API');
      fullText = data.content?.[0]?.text ?? '';
    } else {
      // NORMAL DISPATCH
      const lastUserMsg = [...messages].reverse().find((m: {role: string}) => m.role === 'user');
      const lastText = lastUserMsg?.content || '';
      domain = await classifyDomain(lastText);
      const resp = await getSpecializedResponse(messages, domain);
      fullText = resp.text;
    }
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
        // ETAPA 3: Pós-processar datas no actionData
        if (actionData && typeof actionData === 'object') {
          actionData = postProcessActionData(actionData);
        }
        console.log('[Dispatch] Action:', action, actionData);
      } catch (e) {
        console.error('[Dispatch] Erro parseando action:', e, actionMatch[1]);
      }
    }

    // Parse VAULT_SAVE block for Marcos
    let vault_save = null;
    const vaultMatch = cleanReply.match(/\[VAULT_SAVE:\s*({[\s\S]*?})\]/);
    let finalReply = cleanReply;
    if (vaultMatch) {
      try { vault_save = JSON.parse(vaultMatch[1]); } catch(e) {}
      finalReply = cleanReply.replace(/\[VAULT_SAVE:[\s\S]*?\]/g, '').trim();
    }

    return new Response(
      JSON.stringify({ reply: finalReply || 'Mensagem processada.', action, actionData, agente: domain, vault_save }),
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
