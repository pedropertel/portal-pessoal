// ── Agenda — Events, Calendar, Stats ──

import { sb } from '../core/supabase.js';
import { getState, setState } from '../core/store.js';
import { openModal, closeModal } from '../core/modal.js';
import { showToast } from '../core/toast.js';
import { esc, fmtDate } from '../core/utils.js';

export async function loadAgenda() {
  const { data } = await sb.from('eventos').select('*').order('data_inicio', { ascending: true }).limit(200);
  setState('events', data || []);
  renderAgendaList();
  renderMiniCalendar();
  renderAgendaStats();
}

function renderAgendaList() {
  const wrap = document.getElementById('agenda-events-list');
  const events = getState('events') || [];
  if (!events.length) { wrap.innerHTML = '<div class="agenda-empty">📅 Nenhum evento — clique em "+ Novo evento" para criar.</div>'; return; }
  const groups = {};
  const now = new Date(); now.setHours(0, 0, 0, 0);
  events.forEach(ev => {
    const d = new Date(ev.data_inicio);
    const key = d.toISOString().split('T')[0];
    if (!groups[key]) groups[key] = [];
    groups[key].push(ev);
  });
  const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  let html = '';
  const sortedKeys = Object.keys(groups).sort();
  sortedKeys.forEach(key => {
    const d = new Date(key + 'T12:00:00');
    const isToday = d.toDateString() === now.toDateString();
    const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
    const isTomorrow = d.toDateString() === tomorrow.toDateString();
    const isPast = d < now && !isToday;
    const label = isToday ? 'Hoje' : isTomorrow ? 'Amanhã' : `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`;
    const evColors = ['#00C9A7', '#4A90D9', '#F5A623', '#8B5CF6', '#E8533F', '#22C55E'];
    html += `<div class="agenda-day${isPast ? ' past' : ''}"><div class="agenda-day-label">${label}</div>`;
    groups[key].forEach((ev, i) => {
      const t = new Date(ev.data_inicio);
      const time = ev.dia_inteiro ? 'Dia todo' : t.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const color = ev.cor || evColors[i % evColors.length];
      html += `<div class="agenda-ev" onclick="openEditEvent('${ev.id}')">
        <div class="agenda-ev-bar" style="background:${color}"></div>
        <div class="agenda-ev-time">${time}</div>
        <div><div class="agenda-ev-title">${esc(ev.titulo)}</div>${ev.local ? `<div class="agenda-ev-loc">📍 ${esc(ev.local)}</div>` : ''}</div>
      </div>`;
    });
    html += '</div>';
  });
  wrap.innerHTML = html;
}

function renderMiniCalendar() {
  const cal = document.getElementById('mini-calendar');
  const now = new Date();
  const year = now.getFullYear(), month = now.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  document.getElementById('cal-month-label').textContent = monthNames[month] + ' ' + year;
  const eventDays = new Set();
  (getState('events') || []).forEach(ev => {
    const d = new Date(ev.data_inicio);
    if (d.getMonth() === month && d.getFullYear() === year) eventDays.add(d.getDate());
  });
  let html = '<div class="agenda-mini-cal">';
  ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].forEach(d => html += `<div class="cal-dow">${d}</div>`);
  for (let i = 0; i < firstDay; i++) html += '<div class="cal-day other"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = d === now.getDate();
    const hasEv = eventDays.has(d);
    html += `<div class="cal-day${isToday ? ' today' : ''}${hasEv ? ' has-event' : ''}">${d}</div>`;
  }
  html += '</div>';
  cal.innerHTML = html;
}

function renderAgendaStats() {
  const events = getState('events') || [];
  const now = new Date();
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay()); weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 7);
  const weekCount = events.filter(e => { const d = new Date(e.data_inicio); return d >= weekStart && d < weekEnd; }).length;
  const monthCount = events.filter(e => { const d = new Date(e.data_inicio); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).length;
  const future = events.filter(e => new Date(e.data_inicio) > now);
  const next = future.length ? future[0] : null;
  document.getElementById('ev-week-count').textContent = weekCount;
  document.getElementById('ev-month-count').textContent = monthCount;
  document.getElementById('ev-next-label').textContent = next ? next.titulo + ' · ' + fmtDate(next.data_inicio) : 'Nenhum';
}

export function openNewEvent() {
  const entidades = getState('entidades') || [];
  const empOpts = entidades.map(e => `<option value="${e.id}">${e.icone} ${esc(e.nome)}</option>`).join('');
  openModal('Novo Evento', '', `
    <label class="m-label">Título</label><input class="m-input" id="m-ev-ttl" placeholder="Ex: Reunião com fornecedor">
    <label class="m-label">Data e hora</label><input class="m-input" type="datetime-local" id="m-ev-dt">
    <label class="m-label">Local (opcional)</label><input class="m-input" id="m-ev-local" placeholder="Ex: Vila Velha">
    <label class="m-label">Empresa</label>
    <select class="m-select" id="m-ev-emp"><option value="">Sem empresa</option>${empOpts}</select>
  `, [
    { label: 'Cancelar', cls: 'btn-cancel', action: closeModal },
    { label: 'Criar evento', cls: 'btn-confirm', action: async () => {
      const titulo = document.getElementById('m-ev-ttl').value.trim();
      if (!titulo) { showToast('⚠️', 'Preencha o título', ''); return; }
      await sb.from('eventos').insert({ titulo, data_inicio: document.getElementById('m-ev-dt').value ? new Date(document.getElementById('m-ev-dt').value).toISOString() : new Date().toISOString(), local: document.getElementById('m-ev-local').value || null, entidade_id: document.getElementById('m-ev-emp').value || null, notificar_minutos: 30 });
      closeModal(); loadAgenda(); showToast('📅', 'Evento criado!', '');
    } }
  ]);
}

export function openEditEvent(id) {
  const ev = (getState('events') || []).find(x => x.id === id);
  if (!ev) return;
  const entidades = getState('entidades') || [];
  const empOpts = entidades.map(e => `<option value="${e.id}" ${ev.entidade_id === e.id ? 'selected' : ''}>${e.icone} ${esc(e.nome)}</option>`).join('');
  const dtVal = ev.data_inicio ? new Date(ev.data_inicio).toISOString().slice(0, 16) : '';
  openModal('Editar Evento', '', `
    <label class="m-label">Título</label><input class="m-input" id="m-ev-ttl" value="${esc(ev.titulo)}">
    <label class="m-label">Data e hora</label><input class="m-input" type="datetime-local" id="m-ev-dt" value="${dtVal}">
    <label class="m-label">Local</label><input class="m-input" id="m-ev-local" value="${esc(ev.local || '')}">
    <label class="m-label">Empresa</label>
    <select class="m-select" id="m-ev-emp"><option value="">Sem empresa</option>${empOpts}</select>
  `, [
    { label: 'Excluir', cls: 'btn-cancel', style: 'color:var(--red2)', action: async () => { if (confirm('Excluir evento?')) { await sb.from('eventos').delete().eq('id', id); closeModal(); loadAgenda(); showToast('🗑️', 'Evento excluído', ''); } } },
    { label: 'Salvar', cls: 'btn-confirm', action: async () => {
      const titulo = document.getElementById('m-ev-ttl').value.trim();
      if (!titulo) return;
      await sb.from('eventos').update({ titulo, data_inicio: document.getElementById('m-ev-dt').value ? new Date(document.getElementById('m-ev-dt').value).toISOString() : ev.data_inicio, local: document.getElementById('m-ev-local').value || null, entidade_id: document.getElementById('m-ev-emp').value || null }).eq('id', id);
      closeModal(); loadAgenda(); showToast('✅', 'Evento atualizado', '');
    } }
  ]);
}

export function showGcalModal() {
  openModal('Conectar Google Calendar', 'Siga os passos para integrar o Google Calendar', `
    <div style="background:var(--card2);border:1px solid var(--border);border-radius:var(--r-sm);padding:14px;margin-bottom:10px">
      <div style="font-size:13px;font-weight:600;color:var(--white);margin-bottom:4px">1. Acesse o Google Cloud Console</div>
      <div style="font-size:12px;color:var(--text2)">Abra <a href="https://console.cloud.google.com" target="_blank" style="color:var(--teal)">console.cloud.google.com</a> e crie um projeto "portal-pessoal"</div>
    </div>
    <div style="background:var(--card2);border:1px solid var(--border);border-radius:var(--r-sm);padding:14px;margin-bottom:10px">
      <div style="font-size:13px;font-weight:600;color:var(--white);margin-bottom:4px">2. Ative a API do Google Calendar</div>
      <div style="font-size:12px;color:var(--text2)">APIs e serviços → Biblioteca → "Google Calendar API" → Ativar</div>
    </div>
    <div style="background:var(--card2);border:1px solid var(--border);border-radius:var(--r-sm);padding:14px;margin-bottom:10px">
      <div style="font-size:13px;font-weight:600;color:var(--white);margin-bottom:4px">3. Crie credencial OAuth 2.0</div>
      <div style="font-size:12px;color:var(--text2)">Credenciais → Criar → OAuth → Aplicativo Web → adicione <b>portal-pessoal-plum.vercel.app</b></div>
    </div>
    <div style="background:var(--card2);border:1px solid var(--border);border-radius:var(--r-sm);padding:14px">
      <div style="font-size:13px;font-weight:600;color:var(--white);margin-bottom:4px">4. Me mande o Client ID</div>
      <div style="font-size:12px;color:var(--text2)">Formato: <code style="color:var(--teal)">123456.apps.googleusercontent.com</code><br>Me envie pelo chat e eu configuro!</div>
    </div>
  `, [{ label: 'Fechar', cls: 'btn-confirm', action: closeModal }]);
}
