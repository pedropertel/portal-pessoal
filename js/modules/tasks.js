// ── Tasks — Kanban, Drag & Drop, Reminders ──

import { sb } from '../core/supabase.js';
import { getState, setState } from '../core/store.js';
import { openModal, closeModal } from '../core/modal.js';
import { showToast } from '../core/toast.js';
import { esc, fmtDate } from '../core/utils.js';
import { getEntidadeNome } from '../core/ui.js';
import { loadDashboard } from './dashboard.js';

// FIX: Use Map<taskId, timerId> instead of Array to prevent phantom timers
const reminderTimers = new Map();

export async function loadTasks() {
  const { data } = await sb.from('tarefas').select('*').order('criado_em', { ascending: false }).limit(200);
  setState('tasks', data || []);
  renderKanban();
  document.getElementById('tasks-badge').textContent = (data || []).filter(t => t.status === 'pendente' || t.status === 'em_andamento').length;
  scheduleReminders();
}

export function renderKanban() {
  let tasks = getState('tasks') || [];
  const filterEmp = document.getElementById('task-filter-empresa')?.value;
  if (filterEmp) tasks = tasks.filter(t => t.entidade_id === filterEmp);
  const prioOrder = { urgente: 0, alta: 1, media: 2, baixa: 3 };
  tasks = [...tasks].sort((a, b) => (prioOrder[a.prioridade] ?? 2) - (prioOrder[b.prioridade] ?? 2));

  const cols = [
    { key: 'pendente', label: '📋 Pendente', color: 'var(--blue)' },
    { key: 'em_andamento', label: '⚡ Em andamento', color: 'var(--gold)' },
    { key: 'concluida', label: '✅ Concluída', color: 'var(--teal)' },
  ];
  const board = document.getElementById('kanban-board');
  board.innerHTML = '';
  cols.forEach(col => {
    const items = tasks.filter(t => t.status === col.key);
    const el = document.createElement('div');
    el.className = 'kanban-col';
    el.innerHTML = `
      <div class="kanban-hdr">
        <div class="kanban-ttl"><span style="color:${col.color}">●</span> ${col.label} <span class="kanban-cnt">${items.length}</span></div>
        <span class="kanban-add" onclick="openNewTask('${col.key}')">＋</span>
      </div>
      <div class="kanban-body" id="col-${col.key}" data-status="${col.key}">
        ${items.length === 0 ? '<div class="kanban-placeholder" style="text-align:center;color:var(--text3);font-size:12px;padding:16px">Arraste tarefas aqui</div>' : ''}
        ${items.map(t => {
          const empLabel = getEntidadeNome(t.entidade_id);
          return `
          <div class="task-card" draggable="true" data-id="${t.id}" onclick="openEditTask('${t.id}')">
            <div class="task-ttl">${t.lembrete_em ? `<span style="font-size:11px;color:var(--gold);margin-right:4px" title="Lembrete: ${new Date(t.lembrete_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}">🔔</span>` : ''}${esc(t.titulo)}</div>
            ${t.descricao ? `<div class="task-desc">${esc(t.descricao)}</div>` : ''}
            <div class="task-footer">
              <div class="row" style="gap:6px;flex-wrap:wrap">
                <span class="prio ${t.prioridade || 'media'}">${t.prioridade || 'média'}</span>
                ${empLabel ? `<span class="task-empresa">${empLabel}</span>` : ''}
              </div>
              <span class="task-date">${t.data_vencimento ? fmtDate(t.data_vencimento) : ''}</span>
            </div>
          </div>`;
        }).join('')}
      </div>`;
    board.appendChild(el);
  });
  setupDragDrop();
}

function setupDragDrop() {
  const cards = document.querySelectorAll('.task-card[draggable]');
  const cols = document.querySelectorAll('.kanban-body');
  cards.forEach(card => {
    card.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', card.dataset.id);
      card.classList.add('dragging');
      card._dragging = true;
      setTimeout(() => card._dragging = false, 300);
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
    card.onclick = function(e) { if (this._dragging) { e.stopPropagation(); return; } openEditTask(this.dataset.id); };
  });
  cols.forEach(col => {
    col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('drag-over'); });
    col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
    col.addEventListener('drop', async e => {
      e.preventDefault(); col.classList.remove('drag-over');
      const id = e.dataTransfer.getData('text/plain');
      const newStatus = col.dataset.status;
      if (!id || !newStatus) return;
      const task = (getState('tasks') || []).find(t => t.id === id);
      if (!task || task.status === newStatus) return;
      const upd = { status: newStatus };
      if (newStatus === 'concluida') upd.data_conclusao = new Date().toISOString();
      await sb.from('tarefas').update(upd).eq('id', id);
      await loadTasks();
      showToast('✅', 'Tarefa movida para ' + (newStatus === 'pendente' ? 'Pendente' : newStatus === 'em_andamento' ? 'Em andamento' : 'Concluída'), '');
    });
  });
}

export function openNewTask(status = 'pendente') {
  const entidades = getState('entidades') || [];
  const empOpts = entidades.map(e => `<option value="${e.id}">${e.icone} ${esc(e.nome)}</option>`).join('');
  openModal('Nova Tarefa', 'Preencha os dados da tarefa', `
    <label class="m-label">Título</label><input class="m-input" id="m-task-ttl" placeholder="Ex: Revisar contrato da gráfica">
    <label class="m-label">Descrição (opcional)</label><textarea class="m-textarea" id="m-task-desc" placeholder="Detalhes da tarefa..." rows="2"></textarea>
    <label class="m-label">Empresa</label>
    <select class="m-select" id="m-task-emp"><option value="">Sem empresa</option>${empOpts}</select>
    <label class="m-label">Prioridade</label>
    <select class="m-select" id="m-task-prio"><option value="baixa">🟢 Baixa</option><option value="media" selected>🟡 Média</option><option value="alta">🔴 Alta</option><option value="urgente">🚨 Urgente</option></select>
    <label class="m-label">Data de vencimento</label><input class="m-input" type="date" id="m-task-date">
    <label class="m-label">Status</label>
    <select class="m-select" id="m-task-status"><option value="pendente" ${status === 'pendente' ? 'selected' : ''}>Pendente</option><option value="em_andamento" ${status === 'em_andamento' ? 'selected' : ''}>Em andamento</option></select>
    <label class="m-label">🔔 Lembrar em (opcional)</label>
    <div class="row" style="gap:8px"><input class="m-input" type="date" id="m-task-lemb-date" style="flex:1"><input class="m-input" type="time" id="m-task-lemb-time" style="flex:1"></div>
  `, [
    { label: 'Cancelar', cls: 'btn-cancel', action: closeModal },
    { label: 'Criar tarefa', cls: 'btn-confirm', action: async () => {
      const titulo = document.getElementById('m-task-ttl').value.trim();
      if (!titulo) { showToast('⚠️', 'Preencha o título', ''); return; }
      const lembDate = document.getElementById('m-task-lemb-date').value;
      const lembTime = document.getElementById('m-task-lemb-time').value;
      const lembrete_em = (lembDate && lembTime) ? new Date(lembDate + 'T' + lembTime).toISOString() : null;
      await sb.from('tarefas').insert({ titulo, descricao: document.getElementById('m-task-desc').value.trim() || null, entidade_id: document.getElementById('m-task-emp').value || null, prioridade: document.getElementById('m-task-prio').value, status: document.getElementById('m-task-status').value, data_vencimento: document.getElementById('m-task-date').value || null, lembrete_em });
      closeModal(); loadTasks(); loadDashboard(); showToast('✅', 'Tarefa criada!', '');
    } }
  ]);
}

export function openEditTask(id) {
  const t = (getState('tasks') || []).find(x => x.id === id);
  if (!t) return;
  const entidades = getState('entidades') || [];
  const empOpts = entidades.map(e => `<option value="${e.id}" ${t.entidade_id === e.id ? 'selected' : ''}>${e.icone} ${esc(e.nome)}</option>`).join('');
  const dateVal = t.data_vencimento ? t.data_vencimento.split('T')[0] : '';
  openModal('Editar Tarefa', '', `
    <label class="m-label">Título</label><input class="m-input" id="m-task-ttl" value="${esc(t.titulo)}">
    <label class="m-label">Descrição</label><textarea class="m-textarea" id="m-task-desc" rows="2">${esc(t.descricao || '')}</textarea>
    <label class="m-label">Empresa</label>
    <select class="m-select" id="m-task-emp"><option value="">Sem empresa</option>${empOpts}</select>
    <label class="m-label">Prioridade</label>
    <select class="m-select" id="m-task-prio"><option value="baixa" ${t.prioridade === 'baixa' ? 'selected' : ''}>🟢 Baixa</option><option value="media" ${t.prioridade === 'media' ? 'selected' : ''}>🟡 Média</option><option value="alta" ${t.prioridade === 'alta' ? 'selected' : ''}>🔴 Alta</option><option value="urgente" ${t.prioridade === 'urgente' ? 'selected' : ''}>🚨 Urgente</option></select>
    <label class="m-label">Status</label>
    <select class="m-select" id="m-task-status"><option value="pendente" ${t.status === 'pendente' ? 'selected' : ''}>Pendente</option><option value="em_andamento" ${t.status === 'em_andamento' ? 'selected' : ''}>Em andamento</option><option value="concluida" ${t.status === 'concluida' ? 'selected' : ''}>Concluída</option></select>
    <label class="m-label">Data de vencimento</label><input class="m-input" type="date" id="m-task-date" value="${dateVal}">
    <label class="m-label">🔔 Lembrar em (opcional)</label>
    <div class="row" style="gap:8px"><input class="m-input" type="date" id="m-task-lemb-date" value="${t.lembrete_em ? t.lembrete_em.slice(0, 10) : ''}" style="flex:1"><input class="m-input" type="time" id="m-task-lemb-time" value="${t.lembrete_em ? t.lembrete_em.slice(11, 16) : ''}" style="flex:1"></div>
  `, [
    { label: 'Excluir', cls: 'btn-cancel', style: 'color:var(--red2)', action: async () => {
      if (confirm('Excluir tarefa?')) {
        // Clear reminder timer for this task
        if (reminderTimers.has(id)) { clearTimeout(reminderTimers.get(id)); reminderTimers.delete(id); }
        await sb.from('tarefas').delete().eq('id', id);
        closeModal(); loadTasks(); loadDashboard(); showToast('🗑️', 'Tarefa excluída', '');
      }
    } },
    { label: 'Salvar', cls: 'btn-confirm', action: async () => {
      const titulo = document.getElementById('m-task-ttl').value.trim();
      if (!titulo) return;
      const lembDate = document.getElementById('m-task-lemb-date').value;
      const lembTime = document.getElementById('m-task-lemb-time').value;
      const lembrete_em = (lembDate && lembTime) ? new Date(lembDate + 'T' + lembTime).toISOString() : null;
      const upd = { titulo, descricao: document.getElementById('m-task-desc').value.trim() || null, entidade_id: document.getElementById('m-task-emp').value || null, prioridade: document.getElementById('m-task-prio').value, status: document.getElementById('m-task-status').value, data_vencimento: document.getElementById('m-task-date').value || null, lembrete_em };
      if (upd.status === 'concluida' && t.status !== 'concluida') upd.data_conclusao = new Date().toISOString();
      await sb.from('tarefas').update(upd).eq('id', id);
      closeModal(); loadTasks(); loadDashboard(); showToast('✅', 'Tarefa atualizada', '');
    } }
  ]);
}

export function scheduleReminders() {
  // FIX: Clear ALL existing timers first
  for (const [taskId, timerId] of reminderTimers) {
    clearTimeout(timerId);
  }
  reminderTimers.clear();

  const tasks = getState('tasks') || [];
  const now = Date.now();
  const in24h = now + 24 * 60 * 60 * 1000;

  tasks.forEach(t => {
    if (!t.lembrete_em || t.status === 'concluida') return;
    const target = new Date(t.lembrete_em).getTime();
    if (target <= now || target > in24h) return;
    const delay = target - now;
    const timer = setTimeout(() => {
      window.triggerNotif?.('🔔 ' + t.titulo, 'Lembrete de tarefa', '🔔');
      reminderTimers.delete(t.id);
    }, delay);
    reminderTimers.set(t.id, timer);
  });
  if (reminderTimers.size) console.log('[Reminders]', reminderTimers.size, 'lembretes agendados');
}
