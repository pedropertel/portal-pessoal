// ── UI — Sidebar, Theme, Shortcuts, Search ──

import { getState } from './store.js';
import { goPage } from './router.js';
import { esc, fmtDate } from './utils.js';

let sidebarOpen = window.innerWidth > 768;

export function setupSidebar() {
  const sidebar = document.getElementById('sidebar');
  const isMobile = window.innerWidth <= 768;
  if (isMobile) { sidebar.classList.add('mobile-hidden'); sidebarOpen = false; }
  document.getElementById('menu-toggle').onclick = toggleSidebar;
  document.getElementById('mob-overlay').onclick = () => {
    sidebar.classList.remove('mobile-open');
    document.getElementById('mob-overlay').classList.remove('open');
    sidebarOpen = false;
  };
  document.querySelectorAll('.nav-item[data-page]').forEach(item => {
    item.onclick = () => {
      goPage(item.dataset.page);
      if (window.innerWidth <= 768) {
        sidebar.classList.remove('mobile-open');
        document.getElementById('mob-overlay').classList.remove('open');
        sidebarOpen = false;
      }
    };
  });
}

export function toggleSidebar() {
  const sidebar = document.getElementById('sidebar'), isMobile = window.innerWidth <= 768;
  if (isMobile) {
    sidebarOpen = !sidebarOpen;
    sidebar.classList.toggle('mobile-open', sidebarOpen);
    sidebar.classList.remove('mobile-hidden');
    document.getElementById('mob-overlay').classList.toggle('open', sidebarOpen);
  } else {
    sidebarOpen = !sidebarOpen;
    sidebar.classList.toggle('collapsed', !sidebarOpen);
  }
}

export function setupTheme() {
  const saved = localStorage.getItem('portal-theme');
  if (saved === 'light') document.documentElement.classList.add('light');
  updateThemeIcon();
  document.getElementById('theme-toggle').onclick = () => {
    document.documentElement.classList.toggle('light');
    const isLight = document.documentElement.classList.contains('light');
    localStorage.setItem('portal-theme', isLight ? 'light' : 'dark');
    updateThemeIcon();
  };
}

function updateThemeIcon() {
  const btn = document.getElementById('theme-toggle');
  btn.textContent = document.documentElement.classList.contains('light') ? '☀️' : '🌙';
}

export function setupKeyboardShortcuts() {
  document.addEventListener('keydown', e => {
    const tag = document.activeElement?.tagName;
    const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); document.getElementById('global-search').focus(); return; }
    if (e.key === 'Escape') {
      if (document.getElementById('file-viewer').classList.contains('open')) { closeFileViewer(); return; }
      const dd = document.getElementById('search-dropdown');
      if (dd.style.display !== 'none') { dd.style.display = 'none'; return; }
      // Legacy modal close - will be replaced by new modal system
      if (document.getElementById('overlay').classList.contains('open')) { document.getElementById('overlay').classList.remove('open'); return; }
    }
    if (inInput) return;
    if (e.key === 'n' && !e.ctrlKey && !e.metaKey) { window.openNewTask?.(); return; }
    if (e.key === 'e' && !e.ctrlKey && !e.metaKey) { window.openNewEvent?.(); return; }
    if (e.key === '1') goPage('dashboard');
    if (e.key === '2') goPage('chat');
    if (e.key === '3') goPage('agenda');
    if (e.key === '4') goPage('tasks');
    if (e.key === '5') goPage('docs');
  });
}

// closeFileViewer is defined in docs module, reference via window
function closeFileViewer() {
  window.closeFileViewer?.();
}

export function setupSearch() {
  const input = document.getElementById('global-search');
  const dd = document.getElementById('search-dropdown');
  let debounce = null;
  input.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => doSearch(input.value.trim()), 250);
  });
  input.addEventListener('focus', () => { if (input.value.trim()) doSearch(input.value.trim()); });
  document.addEventListener('click', e => { if (!document.getElementById('search-wrap').contains(e.target)) dd.style.display = 'none'; });
}

function doSearch(q) {
  const dd = document.getElementById('search-dropdown');
  if (!q) { dd.style.display = 'none'; return; }
  const ql = q.toLowerCase();
  const results = [];
  const tasks = getState('tasks') || [];
  const docs = getState('docs')?.files || [];
  const events = getState('events') || [];
  const entidades = getState('entidades') || [];

  tasks.forEach(t => {
    if (t.titulo.toLowerCase().includes(ql) || (t.descricao || '').toLowerCase().includes(ql))
      results.push({ ico: '📋', name: t.titulo, meta: 'Tarefa · ' + ({ pendente: 'Pendente', em_andamento: 'Em andamento', concluida: 'Concluída' }[t.status] || t.status), action: () => { goPage('tasks'); window.openEditTask?.(t.id); } });
  });
  docs.forEach(d => {
    if ((d.nome || '').toLowerCase().includes(ql) || (d.arquivo_nome || '').toLowerCase().includes(ql))
      results.push({ ico: '📄', name: d.nome || d.arquivo_nome, meta: 'Documento', action: () => goPage('docs') });
  });
  events.forEach(ev => {
    if (ev.titulo.toLowerCase().includes(ql))
      results.push({ ico: '📅', name: ev.titulo, meta: 'Evento · ' + fmtDate(ev.data_inicio), action: () => { goPage('agenda'); window.openEditEvent?.(ev.id); } });
  });
  entidades.forEach(e => {
    if (e.nome.toLowerCase().includes(ql))
      results.push({ ico: e.icone || '🏢', name: e.nome, meta: 'Empresa', action: () => {} });
  });
  if (!results.length) { dd.innerHTML = '<div class="search-empty">Nenhum resultado para "' + esc(q) + '"</div>'; dd.style.display = 'block'; return; }
  dd.innerHTML = results.slice(0, 8).map((r, i) => `<div class="search-item" data-idx="${i}"><span class="search-item-ico">${r.ico}</span><div class="search-item-info"><div class="search-item-name">${esc(r.name)}</div><div class="search-item-meta">${esc(r.meta)}</div></div></div>`).join('');
  dd.style.display = 'block';
  dd.querySelectorAll('.search-item').forEach((el, i) => { el.onclick = () => { dd.style.display = 'none'; document.getElementById('global-search').value = ''; results[i].action(); }; });
}

export function populateEmpresaFilter() {
  const sel = document.getElementById('task-filter-empresa');
  if (!sel) return;
  const entidades = getState('entidades') || [];
  entidades.forEach(e => {
    const opt = document.createElement('option');
    opt.value = e.id; opt.textContent = e.icone + ' ' + e.nome;
    sel.appendChild(opt);
  });
}

export function getEntidadeNome(id) {
  const entidades = getState('entidades') || [];
  const e = entidades.find(x => x.id === id);
  return e ? e.icone + ' ' + e.nome : '';
}
