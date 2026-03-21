// ── Config — Settings Page ──

import { sb } from '../core/supabase.js';
import { getState, setState } from '../core/store.js';
import { showToast } from '../core/toast.js';
import { fmtDate } from '../core/utils.js';

let _cedConexao = null;

export async function loadConfig() {
  const { data: conexao } = await sb.from('meta_conexoes').select('*').limit(1).single();
  _cedConexao = conexao || null;
  const accEl = document.getElementById('cfg-meta-account');
  const tokEl = document.getElementById('cfg-meta-token');
  const icoEl = document.getElementById('cfg-meta-status-ico');
  const txtEl = document.getElementById('cfg-meta-status-txt');
  if (_cedConexao?.ad_account_id) accEl.value = _cedConexao.ad_account_id;
  if (_cedConexao?.access_token) tokEl.value = _cedConexao.access_token;
  const cedtec = getState('cedtec') || {};
  const hasCamps = (cedtec.metaCamp || []).length > 0;
  if (_cedConexao?.access_token && hasCamps) { icoEl.style.background = 'var(--green)'; txtEl.textContent = 'Conectado · ' + (cedtec.metaCamp || []).length + ' campanhas'; }
  else if (_cedConexao?.access_token) { icoEl.style.background = 'var(--gold)'; txtEl.textContent = 'Configurado — sincronize'; }
  else { icoEl.style.background = 'var(--red)'; txtEl.textContent = 'Não configurado'; }
  const lastSync = _cedConexao?.last_sync_at;
  document.getElementById('cfg-meta-last-sync').textContent = lastSync ? 'Última sync: ' + fmtDate(lastSync) + ' ' + new Date(lastSync).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
}

export async function cfgSaveMetaConexao() {
  const accId = document.getElementById('cfg-meta-account').value.trim();
  const tokenVal = document.getElementById('cfg-meta-token').value.trim();
  if (!accId || !tokenVal) { showToast('⚠️', 'Preencha ambos os campos', ''); return; }
  const row = { ad_account_id: accId, access_token: tokenVal, ativo: true, status: 'configurado' };
  if (_cedConexao?.id) await sb.from('meta_conexoes').update(row).eq('id', _cedConexao.id);
  else await sb.from('meta_conexoes').insert(row);
  showToast('💾', 'Configuração salva!', '');
  await loadConfig();
}
