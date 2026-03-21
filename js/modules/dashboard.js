// ── Dashboard — Charts + Stats ──

import { sb } from '../core/supabase.js';
import { getState } from '../core/store.js';
import { esc, fmtDate } from '../core/utils.js';
import { getEntidadeNome } from '../core/ui.js';

let mainChartInst = null, pieChartInst = null;

export async function loadDashboard() {
  const [{ data: tasks }, { data: docs }, { data: events }] = await Promise.all([
    sb.from('tarefas').select('*').limit(200),
    sb.from('documentos').select('id').limit(1000),
    sb.from('eventos').select('*').gte('data_inicio', new Date().toISOString()).order('data_inicio').limit(20)
  ]);
  const pend = (tasks || []).filter(t => t.status === 'pendente' || t.status === 'em_andamento');
  document.getElementById('sc-pend').textContent = pend.length;
  document.getElementById('sc-docs').textContent = (docs || []).length;
  document.getElementById('sc-eventos').textContent = (events || []).filter(e => { const d = new Date(e.data_inicio); const t = new Date(); return d.toDateString() === t.toDateString(); }).length;
  document.getElementById('tasks-badge').textContent = pend.length;
  renderRecentTasksTable(tasks || []);
  renderMainChart(tasks || []);
  renderPieChart(tasks || []);
}

function renderRecentTasksTable(tasks) {
  const body = document.getElementById('recent-tasks-body');
  const recent = tasks.slice(0, 8);
  if (!recent.length) { body.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text2);padding:24px">Nenhuma tarefa ainda.</td></tr>'; return; }
  const pMap = { urgente: '<span class="badge red">🚨 Urgente</span>', alta: '<span class="badge gold">🔴 Alta</span>', media: '<span class="badge blue">🟡 Média</span>', baixa: '<span class="badge green">🟢 Baixa</span>' };
  const sMap = { pendente: '<span class="badge blue">Pendente</span>', em_andamento: '<span class="badge teal">Em andamento</span>', concluida: '<span class="badge green">Concluída</span>', cancelada: '<span class="badge red">Cancelada</span>' };
  body.innerHTML = recent.map(t => `<tr onclick="goPage('tasks')"><td>${esc(t.titulo)}</td><td>${pMap[t.prioridade] || t.prioridade}</td><td>${sMap[t.status] || t.status}</td><td>${t.data_vencimento ? fmtDate(t.data_vencimento) : '—'}</td></tr>`).join('');
}

function renderMainChart(tasks) {
  const ctx = document.getElementById('main-chart');
  if (!ctx) return;
  const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'], today = new Date();
  const labels = [], created = [], done = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    const ds = d.toISOString().split('T')[0];
    labels.push(i === 0 ? 'Hoje' : days[d.getDay()]);
    created.push(tasks.filter(t => t.criado_em?.startsWith(ds)).length);
    done.push(tasks.filter(t => t.data_conclusao?.startsWith(ds)).length);
  }
  if (mainChartInst) mainChartInst.destroy();
  mainChartInst = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [
      { label: 'Criadas', data: created, borderColor: '#00C9A7', backgroundColor: 'rgba(0,201,167,.15)', fill: true, tension: .4, pointRadius: 4, pointBackgroundColor: '#00C9A7' },
      { label: 'Concluídas', data: done, borderColor: '#4A90D9', backgroundColor: 'rgba(74,144,217,.12)', fill: true, tension: .4, pointRadius: 4, pointBackgroundColor: '#4A90D9' }
    ] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1E2435', titleColor: '#EEF2FF', bodyColor: '#C8D0E0', borderColor: '#2A3148', borderWidth: 1 } }, scales: { x: { grid: { color: 'rgba(42,49,72,.5)' }, ticks: { color: '#6B7A99', font: { size: 11 } } }, y: { grid: { color: 'rgba(42,49,72,.5)' }, ticks: { color: '#6B7A99', font: { size: 11 }, stepSize: 1, precision: 0 } } } }
  });
}

function renderPieChart(tasks) {
  const ctx = document.getElementById('pie-chart');
  if (!ctx) return;
  const entidades = getState('entidades') || [];
  const labels = [], vals = [], colors = [];
  let semEmpresa = 0;
  entidades.forEach(e => {
    const count = tasks.filter(t => t.entidade_id === e.id).length;
    if (count > 0) { labels.push(e.nome); vals.push(count); colors.push(e.cor || '#6B7A99'); }
  });
  semEmpresa = tasks.filter(t => !t.entidade_id).length;
  if (semEmpresa > 0) { labels.push('Sem empresa'); vals.push(semEmpresa); colors.push('#00C9A7'); }
  if (!vals.length) { labels.push('Nenhuma tarefa'); vals.push(1); colors.push('#2A3148'); }
  if (pieChartInst) pieChartInst.destroy();
  const bgColor = getComputedStyle(document.documentElement).getPropertyValue('--card').trim() || '#1E2435';
  pieChartInst = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data: vals, backgroundColor: colors, borderColor: bgColor, borderWidth: 2 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#6B7A99', font: { size: 11 }, padding: 12, boxWidth: 12 } }, tooltip: { backgroundColor: '#1E2435', titleColor: '#EEF2FF', bodyColor: '#C8D0E0', borderColor: '#2A3148', borderWidth: 1 } } }
  });
}
