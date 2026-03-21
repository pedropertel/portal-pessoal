// ── App Entry Point — Auth, Init, Notifications ──

import { sb } from './core/supabase.js';
import { getState, setState } from './core/store.js';
import { goPage, registerPage } from './core/router.js';
import { showToast } from './core/toast.js';
import { setupSidebar, setupTheme, setupKeyboardShortcuts, setupSearch, populateEmpresaFilter } from './core/ui.js';
import { loadDashboard } from './modules/dashboard.js';
import { loadTasks, renderKanban, openNewTask, openEditTask } from './modules/tasks.js';
import { loadDocs, goRoot, goToPathIndex, openNewFolder, closeFileViewer, triggerUpload, setupDocButtons } from './modules/docs.js';
import { setupChat, loadChatHistory, clearChat, renderMarkdown } from './modules/chat.js';
import { loadAgenda, openNewEvent, openEditEvent, showGcalModal } from './modules/agenda.js';
import { loadSitio, sitioTab, sitioOpenNewCentro, sitioOpenEditCentro, sitioOpenNewLanc, sitioOpenEditLanc, sitioDeleteLanc, sitioRenderLancs, sitioPreviewAttach, sitioViewAttach, renderIconPicker, renderColorPicker } from './modules/sitio.js';
import { loadCedtec, cedtecTab, cedtecOpenRecarga, cedtecDeleteRecarga, cedtecSyncMeta, marcosSendMsg, marcosSendQuick, marcosSavePersona, marcosRestorePersona, marcosManualSave, marcosShowRaw } from './modules/cedtec.js';
import { loadConfig, cfgSaveMetaConexao } from './modules/config.js';

// ── Register Pages with Router ──
registerPage('dashboard', loadDashboard);
registerPage('tasks', renderKanban);
registerPage('docs', loadDocs);
registerPage('agenda', loadAgenda);
registerPage('sitio', loadSitio);
registerPage('cedtec', loadCedtec);
registerPage('config', loadConfig);

// ── Bridge: expose functions to window for HTML onclick handlers ──
window.goPage = goPage;
window.openNewTask = openNewTask;
window.openEditTask = openEditTask;
window.openNewEvent = openNewEvent;
window.openEditEvent = openEditEvent;
window.clearChat = clearChat;
window.renderKanban = renderKanban;
window.showGcalModal = showGcalModal;
window.goRoot = goRoot;
window.goToPathIndex = goToPathIndex;
window.closeFileViewer = closeFileViewer;

// Sítio
window.sitioTab = sitioTab;
window.sitioOpenNewCentro = sitioOpenNewCentro;
window.sitioOpenEditCentro = sitioOpenEditCentro;
window.sitioOpenNewLanc = sitioOpenNewLanc;
window.sitioOpenEditLanc = sitioOpenEditLanc;
window.sitioDeleteLanc = sitioDeleteLanc;
window.sitioRenderLancs = sitioRenderLancs;
window.sitioPreviewAttach = sitioPreviewAttach;
window.sitioViewAttach = sitioViewAttach;
window.renderIconPicker = renderIconPicker;
window.renderColorPicker = renderColorPicker;

// CEDTEC / Marcos
window.cedtecTab = cedtecTab;
window.cedtecOpenRecarga = cedtecOpenRecarga;
window.cedtecDeleteRecarga = cedtecDeleteRecarga;
window.cedtecSyncMeta = cedtecSyncMeta;
window.marcosSendMsg = marcosSendMsg;
window.marcosSendQuick = marcosSendQuick;
window.marcosSavePersona = marcosSavePersona;
window.marcosRestorePersona = marcosRestorePersona;
window.marcosManualSave = marcosManualSave;
window.marcosShowRaw = marcosShowRaw;

// Config
window.cfgSaveMetaConexao = cfgSaveMetaConexao;

// ── Notifications ──
let notifInterval = null;
let _notifTimer = null;

async function requestNotifPermission() {
  if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
}

async function checkNotifs() {
  const { data } = await sb.from('eventos').select('*').gte('data_inicio', new Date().toISOString()).order('data_inicio').limit(10);
  if (!data) return;
  const now = Date.now();
  data.forEach(ev => {
    const diff = new Date(ev.data_inicio).getTime() - now;
    const mins = ev.notificar_minutos || 30;
    if (diff > 0 && diff <= mins * 60000) {
      const key = 'notif_' + ev.id;
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1');
        triggerNotif('📅 ' + ev.titulo, `Em ${Math.round(diff / 60000)} minutos`, '📅');
      }
    }
  });
}

export function closeNotif() {
  if (_notifTimer) { clearTimeout(_notifTimer); _notifTimer = null; }
  document.getElementById('push-notif').classList.remove('show');
}
window.closeNotif = closeNotif;

function triggerNotif(title, msg, ico = '🌿') {
  if (_notifTimer) { clearTimeout(_notifTimer); _notifTimer = null; }
  document.getElementById('pn-title').textContent = title;
  document.getElementById('pn-msg').textContent = msg;
  document.getElementById('pn-ico').textContent = ico;
  const pn = document.getElementById('push-notif');
  pn.classList.add('show');
  _notifTimer = setTimeout(() => { pn.classList.remove('show'); _notifTimer = null; }, 8000);
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)(), osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.4);
  } catch (e) {}
  if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body: msg, icon: '/icon-192.png' });
  showToast(ico, title, msg);
}
window.triggerNotif = triggerNotif;

document.getElementById('notif-toggle').onclick = () => showToast('🔔', 'Notificações', 'Sem novas notificações');

// ── Auth ──
document.getElementById('abtn').onclick = signIn;
document.getElementById('ae').onkeydown = e => { if (e.key === 'Enter') signIn(); };
document.getElementById('ap').onkeydown = e => { if (e.key === 'Enter') signIn(); };
document.getElementById('signout-btn').onclick = async () => {
  if (!confirm('Sair do portal?')) return;
  if (notifInterval) { clearInterval(notifInterval); notifInterval = null; }
  setState('ui', { appInitialized: false });
  await sb.auth.signOut();
};

async function signIn() {
  const email = document.getElementById('ae').value.trim(), pass = document.getElementById('ap').value;
  const btn = document.getElementById('abtn'), err = document.getElementById('aerr');
  if (!email || !pass) { err.textContent = 'Preencha e-mail e senha.'; return; }
  btn.disabled = true; btn.textContent = 'Entrando...'; err.textContent = '';
  const { error } = await sb.auth.signInWithPassword({ email, password: pass });
  if (error) { err.textContent = 'E-mail ou senha incorretos.'; btn.disabled = false; btn.textContent = 'Entrar'; }
}

// ── Init ──
async function initApp() {
  setupSidebar();
  setupSearch();
  setupTheme();
  setupKeyboardShortcuts();
  setupChat();
  setupDocButtons();

  // Load entidades first
  const { data: ent } = await sb.from('entidades').select('*').eq('ativo', true).order('nome');
  setState('entidades', ent || []);
  populateEmpresaFilter();

  // Load sitio centros early (needed by handleActionGasto from chat)
  const { data: centros } = await sb.from('sitio_categorias').select('*').order('nome');
  setState('sitio', { centros: centros || [], lancamentos: [] });

  // Load all data in parallel
  await Promise.all([loadDashboard(), loadTasks(), loadDocs(), loadChatHistory(), loadAgenda()]);

  requestNotifPermission();
  if (notifInterval) clearInterval(notifInterval);
  notifInterval = setInterval(checkNotifs, 60000);
  setInterval(() => { loadTasks(); }, 3600000);
}

sb.auth.onAuthStateChange((ev, session) => {
  if (ev === 'SIGNED_IN' || ev === 'TOKEN_REFRESHED' || ev === 'INITIAL_SESSION') {
    const ui = getState('ui');
    if (session && !ui.appInitialized) {
      document.getElementById('auth').style.display = 'none';
      document.getElementById('app').style.display = 'flex';
      setState('ui', { appInitialized: true });
      initApp();
    }
  }
  if (ev === 'SIGNED_OUT') {
    setState('ui', { appInitialized: false });
    document.getElementById('app').style.display = 'none';
    document.getElementById('auth').style.display = 'flex';
  }
});
