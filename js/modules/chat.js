// ── Chat — Claude Dispatch, Voice, Actions ──

import { sb } from '../core/supabase.js';
import { getState, setState } from '../core/store.js';
import { showToast } from '../core/toast.js';
import { esc, parseDateBR } from '../core/utils.js';

const SURL = 'https://msbwplsknncnxwsalumd.supabase.co';
const AGENTE_LABELS = { tarefas: '📋 Tarefas', agenda: '📅 Agenda', grafica: '🖨️ Gráfica', sitio: '🌱 Sítio', cedtec: '🎓 CEDTEC', geral: '🤖 Geral' };

let recognition = null, isRec = false, recTimeout = null;

export function setupChat() {
  const ta = document.getElementById('chat-ta');
  const sbtn = document.getElementById('send-btn');
  if (!ta || !sbtn) return;
  ta.oninput = function () { this.style.height = 'auto'; this.style.height = Math.min(this.scrollHeight, 100) + 'px'; sbtn.disabled = !this.value.trim(); };
  ta.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } };
  sbtn.onclick = sendMsg;

  // Mic button
  document.getElementById('mic-btn').onclick = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { showToast('⚠️', 'Microfone não suportado', 'Use Chrome ou Safari'); return; }
    if (isRec) { recognition.stop(); resetMic(); return; }
    if (!recognition) {
      recognition = new SR();
      recognition.lang = 'pt-BR';
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.onresult = e => {
        let interim = '', final = '';
        for (let i = 0; i < e.results.length; i++) {
          if (e.results[i].isFinal) final += e.results[i][0].transcript;
          else interim += e.results[i][0].transcript;
        }
        if (final) {
          ta.value = final;
          ta.style.fontStyle = ''; ta.style.color = '';
          sbtn.disabled = false;
        } else if (interim) {
          ta.value = interim;
          ta.style.fontStyle = 'italic'; ta.style.color = 'var(--text2)';
        }
      };
      recognition.onend = () => { resetMic(); if (ta.value.trim()) { sbtn.disabled = false; ta.focus(); } };
      recognition.onerror = e => {
        resetMic();
        if (e.error === 'not-allowed') showToast('🎙️', 'Microfone bloqueado', 'Ative nas configurações do navegador');
        else if (e.error === 'network') showToast('⚠️', 'Sem conexão', 'Verifique sua internet');
      };
    }
    try {
      recognition.start();
      isRec = true;
      const btn = document.getElementById('mic-btn');
      btn.classList.add('rec'); btn.textContent = '⏹️';
      ta.value = ''; ta.placeholder = 'Ouvindo...';
      recTimeout = setTimeout(() => { if (isRec) { recognition.stop(); ta.placeholder = 'Digite ou grave um áudio...'; } }, 15000);
    } catch (e) { resetMic(); showToast('⚠️', 'Erro ao iniciar microfone', ''); }
  };
}

function resetMic() {
  isRec = false;
  if (recTimeout) { clearTimeout(recTimeout); recTimeout = null; }
  const btn = document.getElementById('mic-btn');
  if (btn) { btn.classList.remove('rec'); btn.textContent = '🎙️'; }
  const ta = document.getElementById('chat-ta');
  if (ta) { ta.style.fontStyle = ''; ta.style.color = ''; }
}

async function sendMsg() {
  const chat = getState('chat');
  if (chat.sending) return;
  const ta = document.getElementById('chat-ta');
  const text = ta.value.trim(); if (!text) return;
  document.getElementById('chat-empty').style.display = 'none';
  appendMsg('u', text); ta.value = ''; ta.style.height = 'auto'; document.getElementById('send-btn').disabled = true;
  const history = [...(chat.history || []), { role: 'user', content: text }];
  setState('chat', { history, sending: true });

  const typing = document.createElement('div'); typing.className = 'typing';
  typing.innerHTML = '<div class="td"></div><div class="td"></div><div class="td"></div>';
  document.getElementById('chat-msgs').appendChild(typing); scrollChat();

  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) throw new Error('Sessão expirada');
    const token = session.access_token;
    const res = await fetch(SURL + '/functions/v1/chat-claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ messages: history })
    });
    const data = await res.json();
    typing.remove();
    const reply = data.reply || 'Sem resposta.';
    const agente = data.agente || 'geral';
    appendMsg('a', reply, null, agente);
    setState('chat', { history: [...history, { role: 'assistant', content: reply }], sending: false });

    // Save both messages to DB
    await sb.from('chat_mensagens').insert({ role: 'user', conteudo: text });
    await sb.from('chat_mensagens').insert({ role: 'assistant', conteudo: reply, acao_executada: data.action || null, acao_dados: data.actionData || null });

    // Execute actions
    if (data.action === 'tarefa') await handleActionTarefa(data.actionData);
    if (data.action === 'evento') await handleActionEvento(data.actionData);
    if (data.action === 'gasto') await handleActionGasto(data.actionData);
    if (data.action === 'sge_import') await handleActionSgeImport(data.actionData);

  } catch (e) {
    typing.remove();
    appendMsg('a', '⚠️ Erro: ' + e.message);
    setState('chat', { ...getState('chat'), sending: false });
  }
}

export function renderMarkdown(text) {
  let html = esc(text);
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  html = html.replace(/^[•\-]\s+(.+)/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
  html = html.replace(/^\d+\.\s+(.+)/gm, '<li>$1</li>');
  html = html.replace(/\n/g, '<br>');
  html = html.replace(/<pre><code>([\s\S]*?)<\/code><\/pre>/g, (m, c) => '<pre><code>' + c.replace(/<br>/g, '\n') + '</code></pre>');
  return html;
}

function appendMsg(role, text, ts, agente) {
  const msgs = document.getElementById('chat-msgs'), div = document.createElement('div');
  div.className = 'msg ' + role;
  const t = ts ? new Date(ts) : new Date();
  const now = t.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const content = role === 'u' ? esc(text).replace(/\n/g, '<br>') : renderMarkdown(text);
  const agenteTag = (role === 'a' && agente && agente !== 'geral') ? `<span style="font-size:10px;background:rgba(0,201,167,.15);color:var(--teal);padding:2px 7px;border-radius:8px;font-weight:600">${AGENTE_LABELS[agente] || agente}</span> ` : '';
  div.innerHTML = `<div class="bubble">${content}</div><div class="msg-t">${agenteTag}${now}</div>`;
  msgs.appendChild(div); scrollChat();
}

function scrollChat() { const m = document.getElementById('chat-msgs'); m.scrollTop = m.scrollHeight; }

export async function loadChatHistory() {
  const { data } = await sb.from('chat_mensagens').select('*').is('contexto', null).order('criado_em', { ascending: true }).limit(100);
  if (!data || !data.length) return;
  document.getElementById('chat-empty').style.display = 'none';
  const history = [];
  data.forEach(m => {
    appendMsg(m.role === 'user' ? 'u' : 'a', m.conteudo, m.criado_em);
    history.push({ role: m.role, content: m.conteudo });
  });
  setState('chat', { history, sending: false });
}

export async function clearChat() {
  if (!confirm('Limpar todo o histórico do chat?')) return;
  await sb.from('chat_mensagens').delete().is('contexto', null);
  setState('chat', { history: [], sending: false });
  document.getElementById('chat-msgs').innerHTML = '';
  const empty = document.createElement('div'); empty.className = 'chat-empty'; empty.id = 'chat-empty';
  empty.innerHTML = '<div class="chat-empty-ico">🤖</div><h3>Olá, Pedro!</h3><p>Histórico limpo. Como posso ajudar?</p>';
  document.getElementById('chat-msgs').appendChild(empty);
  showToast('🗑️', 'Chat limpo!', '');
}

// ── ACTION HANDLERS ──

async function handleActionTarefa(d) {
  if (!d) return;
  const titulo = d.titulo || d.title || d.nome || 'Nova tarefa';
  const { error } = await sb.from('tarefas').insert({
    titulo, prioridade: d.prioridade || d.priority || 'media',
    status: 'pendente', data_vencimento: d.data || d.due_date || null
  });
  if (error) { showToast('❌', 'Erro ao criar tarefa', error.message); return; }
  // Reload tasks module
  const { loadTasks } = await import('./tasks.js');
  const { loadDashboard } = await import('./dashboard.js');
  await loadTasks();
  await loadDashboard();
  showToast('✅', 'Tarefa criada!', titulo);
}

async function handleActionEvento(d) {
  if (!d) return;
  const { error } = await sb.from('eventos').insert({
    titulo: d.titulo || 'Evento',
    data_inicio: d.data_inicio || new Date().toISOString(),
    descricao: d.descricao || null,
    notificar_minutos: 30
  });
  if (error) { showToast('❌', 'Erro ao criar evento', error.message); return; }
  const { loadAgenda } = await import('./agenda.js');
  await loadAgenda();
  showToast('📅', 'Evento criado!', d.titulo || '');
}

async function handleActionGasto(d) {
  if (!d) return;
  const dtISO = parseDateBR(d.data) || new Date().toISOString().split('T')[0];
  let centroId = null;
  if (d.centro_custo) {
    const nome = d.centro_custo.toLowerCase().trim();
    const centros = getState('sitio')?.centros || [];
    const centro = centros.find(c => c.nome.toLowerCase() === nome) || centros.find(c => c.nome.toLowerCase().includes(nome));
    if (centro) centroId = centro.id;
  }
  const { error } = await sb.from('sitio_lancamentos').insert({
    descricao: d.descricao || 'Gasto',
    valor: parseFloat(d.valor) || 0,
    tipo: 'realizado',
    data_lancamento: dtISO,
    data_realizada: dtISO,
    centro_custo_id: centroId,
    notas: d.notas || null
  });
  if (error) { showToast('❌', 'Erro ao registrar gasto', error.message); return; }
  showToast('💰', 'Gasto registrado!', d.descricao || '');
}

async function handleActionSgeImport(d) {
  if (!d) return;
  const { error } = await sb.from('cedtec_sge_importacoes').insert({
    curso: d.curso || 'Geral',
    inscritos: parseInt(d.inscritos) || 0,
    pendentes: parseInt(d.pendentes) || 0,
    matriculados: parseInt(d.matriculados) || 0,
    periodo: d.periodo || null,
    fonte: 'chat'
  });
  if (error) { showToast('❌', 'Erro na importação', error.message); return; }
  showToast('📥', 'Dados SGE importados!', d.curso || '');
}
