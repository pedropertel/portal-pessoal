// ── CEDTEC — Marketing, Meta Ads, Marcos AI, SGE Funnel ──

import { sb } from '../core/supabase.js';
import { getState, setState } from '../core/store.js';
import { openModal, closeModal } from '../core/modal.js';
import { showToast } from '../core/toast.js';
import { esc, fmtDate, fmtMoney } from '../core/utils.js';
import { renderMarkdown } from './chat.js';

const SURL = 'https://msbwplsknncnxwsalumd.supabase.co';
let _cedTrendChart = null;
let _marcosHistory = [], _marcosSending = false;
let _currentPeriod = '30d'; // '30d', '7d', 'today', 'custom'

// ── Period Filter ──

export function cedtecSetPeriod(period) {
  _currentPeriod = period;
  // Update UI
  document.querySelectorAll('#cedtec-period-bar .ptab').forEach(p => p.classList.toggle('on', p.dataset.period === period));
  const customDates = document.getElementById('cedtec-custom-dates');
  if (customDates) customDates.style.display = period === 'custom' ? 'flex' : 'none';
  // Update label
  const labelEl = document.getElementById('ced-period-label');
  if (labelEl) {
    const labels = { '30d': 'Últimos 30 dias', '7d': 'Últimos 7 dias', 'today': 'Hoje', 'custom': 'Período personalizado' };
    labelEl.textContent = labels[period] || '';
  }
  if (period !== 'custom') {
    cedtecRenderVisao();
    cedtecRenderCampanhas();
    cedtecRenderTrend();
  }
}

export function cedtecApplyCustomPeriod() {
  const from = document.getElementById('ced-date-from')?.value;
  const to = document.getElementById('ced-date-to')?.value;
  if (from && to) {
    const labelEl = document.getElementById('ced-period-label');
    if (labelEl) labelEl.textContent = `${from.split('-').reverse().join('/')} a ${to.split('-').reverse().join('/')}`;
    cedtecRenderVisao();
    cedtecRenderCampanhas();
    cedtecRenderTrend();
  }
}

function getFilteredCampaigns() {
  const ced = getState('cedtec') || {};
  const allCamps = ced.metaCamp || [];
  if (_currentPeriod === '30d') return allCamps; // Meta already returns last_30d

  const now = new Date();
  let fromDate, toDate;

  if (_currentPeriod === 'today') {
    fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    toDate = now;
  } else if (_currentPeriod === '7d') {
    fromDate = new Date(now); fromDate.setDate(fromDate.getDate() - 7);
    toDate = now;
  } else if (_currentPeriod === 'custom') {
    const f = document.getElementById('ced-date-from')?.value;
    const t = document.getElementById('ced-date-to')?.value;
    if (!f || !t) return allCamps;
    fromDate = new Date(f);
    toDate = new Date(t); toDate.setHours(23, 59, 59);
  } else {
    return allCamps;
  }

  // For periods shorter than 30d, we estimate proportionally
  // since Meta API returns 30-day aggregated data
  const totalDays = Math.max(1, Math.round((toDate - fromDate) / (1000 * 60 * 60 * 24)));
  const factor = Math.min(1, totalDays / 30);

  return allCamps.map(c => ({
    ...c,
    gasto: (parseFloat(c.gasto) || 0) * factor,
    impressoes: Math.round((c.impressoes || 0) * factor),
    cliques: Math.round((c.cliques || 0) * factor),
    conversoes: Math.round((c.conversoes || 0) * factor),
    messages_count: Math.round((c.messages_count || 0) * factor),
    reach: Math.round((c.reach || 0) * factor),
    _factor: factor,
    _estimated: factor < 1
  }));
}
const MARCOS_DEFAULT_PERSONA = `Você é Marcos, gestor de tráfego pago especialista em Meta Ads para instituições de ensino profissionalizante. Trabalha com o Pedro no CEDTEC há 2 anos. Seu estilo é direto, prático e sem enrolação. Conhece o mercado de cursos técnicos no ES. CPL alvo: R$15-25. CTR saudável: acima de 1%. Frequência máxima: 3.5. Fala como um sócio de confiança.

Você recebe os dados brutos da Meta Ads API (raw JSON completo por campanha incluindo actions, adsets, targeting). Você sabe interpretar todos os action types nativamente. Nunca peça para o sistema filtrar ou classificar dados — você mesmo faz isso na análise. Quando relevante, mencione reach, frequency, e segmentação dos adsets.`;

export function cedtecTab(tab) {
  ['visao','campanhas','marcos','funil','saldo'].forEach(t => {
    const el = document.getElementById('cedtec-' + t);
    if (el) el.style.display = t === tab ? '' : 'none';
  });
  document.querySelectorAll('#cedtec-tabs .ptab').forEach(p => p.classList.toggle('on', p.dataset.tab === tab));
  // Fetch real-time balance when opening saldo tab
  if (tab === 'saldo') {
    fetchMetaBalance().then(data => {
      if (!data) return;
      const ced = getState('cedtec') || {};
      setState('cedtec', { ...ced, meta: { ...ced.meta, saldo_atual: data.balance, limite: data.spend_cap || ced.meta?.limite } });
      cedtecRenderVisao();
      cedtecRenderSaldo();
    });
  }
}

// Fetch real-time balance from Meta API
// Returns { balance, amount_spent, spend_cap } or null on error
async function fetchMetaBalance() {
  try {
    const { data: { session } } = await sb.auth.getSession();
    const token = session?.access_token || '';
    const res = await fetch(SURL + '/functions/v1/meta-balance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: '{}'
    });
    const data = await res.json();
    if (data.error) { console.warn('[MetaBalance]', data.error); return null; }
    console.log('[MetaBalance] Saldo:', data.balance, 'Gasto total:', data.amount_spent);
    return data;
  } catch (e) { console.error('[MetaBalance]', e); return null; }
}

export async function loadCedtec() {
  // Fetch Meta real-time balance + DB data in parallel
  const balancePromise = fetchMetaBalance();
  const [{ data: meta }, { data: rec }, { data: camp }, { data: sge }, { data: metaCamp }] = await Promise.all([
    sb.from('cedtec_conta_meta').select('*').limit(1).single(),
    sb.from('cedtec_recargas').select('*').order('data', { ascending: false }).limit(50),
    sb.from('cedtec_campanhas').select('*').order('atualizado_em', { ascending: false }).limit(50),
    sb.from('cedtec_sge_importacoes').select('*').order('importado_em', { ascending: false }).limit(100),
    sb.from('meta_campanhas_cache').select('*').order('sincronizado_em', { ascending: false }).limit(100)
  ]);

  // Wait for Meta balance (has real saldo)
  const balanceData = await balancePromise;

  // Merge: prefer real-time balance over DB value
  const metaObj = meta || { saldo_atual: 0, limite: 0, gasto_hoje: 0, gasto_mes: 0 };
  if (balanceData?.balance != null) {
    metaObj.saldo_atual = balanceData.balance;
    if (balanceData.spend_cap) metaObj.limite = balanceData.spend_cap;
  }

  setState('cedtec', {
    meta: metaObj,
    recargas: rec || [],
    campanhas: camp || [],
    sge: sge || [],
    metaCamp: metaCamp || []
  });
  cedtecRenderVisao();
  cedtecRenderSaldo();
  cedtecRenderCampanhas();
  cedtecRenderFunil();
  cedtecRenderMatriculas();
  marcosInit();
}

function cedtecRenderVisao() {
  const ced = getState('cedtec') || {};
  const m = ced.meta || {};
  const _cedCampanhas = ced.campanhas || [];
  const _cedSge = ced.sge || [];

  // Use filtered campaigns for all metrics
  const _cedMetaCamp = getFilteredCampaigns();

  // Calculate real spend from Meta campaigns (not from manual table)
  const metaWithData = _cedMetaCamp.filter(c => parseFloat(c.gasto) > 0);
  const totalSpend = metaWithData.reduce((s, c) => s + (parseFloat(c.gasto) || 0), 0);

  // Saldo card: calculate real saldo from recargas - spend
  const _cedRecargas = ced.recargas || [];
  const totalRecargas = _cedRecargas.reduce((s, r) => s + (parseFloat(r.valor) || 0), 0);
  const saldo = (m.saldo_atual || 0) > 0 ? m.saldo_atual : Math.max(0, totalRecargas - totalSpend);
  const gastoMes = totalSpend > 0 ? totalSpend : (m.gasto_mes || 0);
  const mediaDia = gastoMes > 0 ? (gastoMes / 30) : 0;
  const diasRest = mediaDia > 0 ? Math.floor(saldo / mediaDia) : 999;

  document.getElementById('ced-saldo').textContent = fmtMoney(saldo);
  document.getElementById('ced-dias-rest').textContent = diasRest < 999 && diasRest > 0
    ? diasRest + ' dias restantes'
    : totalSpend > 0 ? 'Gasto: ' + fmtMoney(totalSpend) : '—';

  // Alerta
  const alerta = document.getElementById('cedtec-alerta');
  if (diasRest < 3 && m.saldo_atual > 0) {
    alerta.style.display = 'flex';
    document.getElementById('cedtec-alerta-txt').textContent = `Saldo Meta acaba em ${diasRest} dia${diasRest !== 1 ? 's' : ''}!`;
    document.getElementById('cedtec-alerta-sub').textContent = `Saldo: ${fmtMoney(m.saldo_atual)} · Média diária: ${fmtMoney(mediaDia)}`;
  } else { alerta.style.display = 'none'; }

  // Leads + CPL / CTR from filtered campaigns
  const totalLeadsMeta = metaWithData.reduce((s, c) => s + ((c.conversoes || 0) || (c.messages_count || 0)), 0);
  document.getElementById('ced-leads').textContent = totalLeadsMeta;
  const avgCPL = totalLeadsMeta > 0 ? totalSpend / totalLeadsMeta : 0;
  const avgCTR = metaWithData.length ? metaWithData.reduce((s, c) => s + (parseFloat(c.ctr) || 0), 0) / metaWithData.length : 0;
  document.getElementById('ced-cpl-val').textContent = avgCPL > 0 ? fmtMoney(avgCPL) : '—';
  document.getElementById('ced-ctr-val').textContent = avgCTR > 0 ? avgCTR.toFixed(2) + '%' : '—';
  // CPL alert badge
  const cplEl = document.getElementById('ced-cpl-badge');
  if (avgCPL > 0) {
    const median = metaWithData.length ? metaWithData.map(c => (c.conversoes || 0) > 0 ? (parseFloat(c.gasto) || 0) / (c.conversoes) : 0).filter(v => v > 0).sort((a, b) => a - b) : [];
    const medianCPL = median.length ? median[Math.floor(median.length / 2)] : avgCPL;
    if (avgCPL > medianCPL * 1.2) cplEl.innerHTML = '<span class="badge red">▲ CPL alto</span>';
    else cplEl.innerHTML = '<span class="badge green">CPL normal</span>';
  } else cplEl.textContent = '';
  document.getElementById('ced-ctr-badge').innerHTML = avgCTR > 0 ? '<span class="badge blue">Média geral</span>' : '';

  // Campanhas ativas — use meta cache if available, fallback to manual
  const ativas = _cedMetaCamp.length
    ? _cedMetaCamp.filter(c => c.status === 'ACTIVE')
    : _cedCampanhas.filter(c => c.status === 'ativa');
  document.getElementById('ced-campanhas-lista').innerHTML = ativas.length ? ativas.map(c => {
    const nome = c.nome || c.name;
    const gasto = parseFloat(c.gasto) || 0;
    const leads = c.conversoes || c.messages_count || c.leads_meta || 0;
    const isMsg = !c.conversoes && c.messages_count > 0;
    return `<div class="sitio-recent-item">
      <span style="font-size:16px">📣</span>
      <div style="flex:1;min-width:0"><div style="color:var(--white);font-weight:500">${esc(nome)}</div><div style="font-size:11px;color:var(--text2)">${leads} ${isMsg ? 'msgs' : 'leads'} · CPL ${leads > 0 ? fmtMoney(gasto / leads) : '—'}</div></div>
      <div style="font-weight:600;color:var(--white)">${fmtMoney(gasto)}</div>
    </div>`;
  }).join('') : '<div style="padding:20px;text-align:center;color:var(--text2)">Nenhuma campanha ativa</div>';

  // Trend chart
  cedtecRenderTrend();

  // Funil resumido — FIX: calculate totalInscritos and totalMatric before use
  const totalInscritos = _cedSge.reduce((s, r) => s + (r.inscritos || 0), 0);
  const totalMatric = _cedSge.reduce((s, r) => s + (r.matriculados || 0), 0);
  const totalPend = _cedSge.reduce((s, r) => s + (r.pendentes || 0), 0);
  const maxFunil = Math.max(totalInscritos, 1);
  document.getElementById('ced-funil-resumo').innerHTML = `
    <div style="padding:10px 0">
      <div class="funil-step"><div class="funil-label">Inscritos</div><div class="funil-bar-wrap"><div class="funil-bar" style="width:100%;background:var(--blue)">${totalInscritos}</div></div></div>
      <div class="funil-step"><div class="funil-label">Pendentes</div><div class="funil-bar-wrap"><div class="funil-bar" style="width:${Math.round(totalPend / maxFunil * 100)}%;background:var(--gold)">${totalPend}</div></div><div class="funil-pct">${totalInscritos ? Math.round(totalPend / totalInscritos * 100) + '%' : '—'}</div></div>
      <div class="funil-step"><div class="funil-label">Matriculados</div><div class="funil-bar-wrap"><div class="funil-bar" style="width:${Math.round(totalMatric / maxFunil * 100)}%;background:var(--teal)">${totalMatric}</div></div><div class="funil-pct">${totalInscritos ? Math.round(totalMatric / totalInscritos * 100) + '%' : '—'}</div></div>
    </div>`;
}

function cedtecRenderSaldo() {
  const ced = getState('cedtec') || {};
  const m = ced.meta || {};
  const _cedRecargas = ced.recargas || [];
  const _cedMetaCamp = ced.metaCamp || [];

  // Parse all values as numbers (DB returns strings, API returns numbers)
  const saldoAtual = typeof m.saldo_atual === 'number' ? m.saldo_atual : (parseFloat(m.saldo_atual) || 0);
  const gastoMesDB = typeof m.gasto_mes === 'number' ? m.gasto_mes : (parseFloat(m.gasto_mes) || 0);
  const gastoHojeDB = typeof m.gasto_hoje === 'number' ? m.gasto_hoje : (parseFloat(m.gasto_hoje) || 0);
  const limiteDB = typeof m.limite === 'number' ? m.limite : (parseFloat(m.limite) || 0);

  const realSpend = _cedMetaCamp.filter(c => parseFloat(c.gasto) > 0).reduce((s, c) => s + (parseFloat(c.gasto) || 0), 0);
  const gastoMes = gastoMesDB > 0 ? gastoMesDB : realSpend;
  const mediaDia = gastoMes > 0 ? (gastoMes / 30) : 0;
  const gastoHoje = gastoHojeDB > 0 ? gastoHojeDB : mediaDia;

  const saldo = saldoAtual;
  const diasRest = mediaDia > 0 ? Math.floor(saldo / mediaDia) : 0;
  const limite = limiteDB > 0 ? limiteDB : (saldo + realSpend);
  const pct = limite > 0 ? Math.round(saldo / limite * 100) : 0;

  console.log('[CedtecSaldo] saldo_atual:', m.saldo_atual, '→ parsed:', saldo, 'gasto_mes:', gastoMes, 'limite:', limite);
  const barColor = diasRest < 3 ? 'var(--red)' : diasRest < 7 ? 'var(--gold)' : 'var(--teal)';

  document.getElementById('ced-saldo-big').textContent = fmtMoney(saldo);
  document.getElementById('ced-saldo-bar').style.width = Math.min(pct, 100) + '%';
  document.getElementById('ced-saldo-bar').style.background = barColor;
  document.getElementById('ced-saldo-pct').textContent = limite > 0 ? `${fmtMoney(saldo)} de ${fmtMoney(limite)} (${pct}%)` : realSpend > 0 ? `Gasto total: ${fmtMoney(realSpend)}` : 'Registre recargas para acompanhar';
  document.getElementById('ced-gasto-hoje').textContent = fmtMoney(gastoHoje);
  document.getElementById('ced-media-dia').textContent = fmtMoney(mediaDia);
  const diasEl = document.getElementById('ced-dias-val');
  diasEl.textContent = mediaDia > 0 && saldo > 0 ? diasRest + ' dias' : mediaDia > 0 ? fmtMoney(gastoMes) + '/mês' : '—';
  diasEl.style.color = diasRest < 3 && saldo > 0 ? 'var(--red2)' : '';

  // Recargas
  document.getElementById('ced-recargas-body').innerHTML = _cedRecargas.length ? _cedRecargas.map(r => `
    <tr><td>${fmtDate(r.data)}</td><td style="font-weight:600">${fmtMoney(r.valor)}</td><td style="color:var(--text2)">${esc(r.notas || '—')}</td>
    <td><span style="cursor:pointer" onclick="cedtecDeleteRecarga('${r.id}')">🗑️</span></td></tr>`).join('')
    : '<tr><td colspan="4" style="text-align:center;color:var(--text2);padding:24px">Nenhuma recarga registrada</td></tr>';
}

function cedtecRenderCampanhas() {
  const ced = getState('cedtec') || {};
  const _cedCampanhas = ced.campanhas || [];
  // Use filtered campaigns
  const _cedMetaCamp = getFilteredCampaigns();
  // Use meta cache if available, fallback to manual
  const camps = _cedMetaCamp.length ? _cedMetaCamp : _cedCampanhas;
  const isMeta = _cedMetaCamp.length > 0;
  const syncTime = isMeta && camps[0]?.sincronizado_em ? fmtDate(camps[0].sincronizado_em) + ' ' + new Date(camps[0].sincronizado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
  document.getElementById('ced-camp-sync').textContent = syncTime ? 'Última sincronização: ' + syncTime : (camps.length ? 'Dados manuais' : 'Sem campanhas — sincronize com a Meta');

  if (!camps.length) {
    document.getElementById('ced-camp-body').innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text2);padding:24px">Nenhuma campanha — clique em "Sincronizar Meta"</td></tr>';
    return;
  }
  const avgCPL = _cedMetaCamp.filter(x => (x.conversoes || 0) > 0).length ? _cedMetaCamp.filter(x => (x.conversoes || 0) > 0).reduce((s, x) => s + (parseFloat(x.gasto) || 0) / (x.conversoes || 1), 0) / _cedMetaCamp.filter(x => (x.conversoes || 0) > 0).length : 0;
  document.getElementById('ced-camp-body').innerHTML = camps.map(c => {
    const nome = c.nome || c.name;
    const status = c.status || '';
    const stNorm = status.toUpperCase();
    const stBadge = stNorm === 'ACTIVE' || status === 'ativa' ? '<span class="badge green">Ativa</span>' : stNorm === 'PAUSED' || status === 'pausada' ? '<span class="badge gold">Pausada</span>' : '<span class="badge blue">' + esc(status) + '</span>';
    const gasto = parseFloat(c.gasto) || 0;
    const impressoes = c.impressoes || 0;
    const cliques = c.cliques || 0;
    const leads = c.conversoes || c.leads_meta || 0;
    const msgs = c.messages_count || 0;
    const ctr = parseFloat(c.ctr) || 0;
    // Use messages as proxy for leads if no actual leads
    const displayLeads = leads > 0 ? leads : (msgs > 0 ? msgs : 0);
    const leadsLabel = leads > 0 ? String(leads) : (msgs > 0 ? `${msgs} <span class="badge purple" style="font-size:9px">msg</span>` : '0');
    const cpl = displayLeads > 0 ? gasto / displayLeads : 0;
    const cplBadge = cpl > 0 && avgCPL > 0 && cpl > avgCPL * 1.2 ? ' <span class="badge red" style="font-size:9px">CPL alto</span>' : '';
    return `<tr>
      <td style="font-weight:500;color:var(--white)">${esc(nome)}${cplBadge}</td><td>${stBadge}</td>
      <td style="font-weight:600">${fmtMoney(gasto)}</td><td>${impressoes.toLocaleString('pt-BR')}</td><td>${cliques.toLocaleString('pt-BR')}</td><td>${leadsLabel}</td><td>${msgs}</td>
      <td>${ctr.toFixed(2)}%</td><td>${cpl > 0 ? fmtMoney(cpl) : '—'}</td></tr>`;
  }).join('');
}

function cedtecRenderFunil() {
  const ced = getState('cedtec') || {};
  const _cedSge = ced.sge || [];
  // Group SGE by curso (most recent per curso)
  const cursoMap = {};
  _cedSge.forEach(r => {
    const key = r.curso || 'Geral';
    if (!cursoMap[key]) cursoMap[key] = r;
  });
  const cursos = Object.entries(cursoMap);
  if (!cursos.length) { document.getElementById('ced-funil-full').innerHTML = '<div class="chart-card"><div style="padding:30px;text-align:center;color:var(--text2)">Importe dados do SGE para ver o funil</div></div>'; return; }
  let html = '';
  cursos.forEach(([curso, d]) => {
    const max = Math.max(d.inscritos || 1, 1);
    html += `<div class="chart-card" style="margin-bottom:10px"><div class="funil-curso-title">📚 ${esc(curso)}</div><div style="padding:8px 14px">
      <div class="funil-step"><div class="funil-label">Inscritos</div><div class="funil-bar-wrap"><div class="funil-bar" style="width:100%;background:var(--blue)">${d.inscritos || 0}</div></div></div>
      <div class="funil-step"><div class="funil-label">Pendentes</div><div class="funil-bar-wrap"><div class="funil-bar" style="width:${Math.round((d.pendentes || 0) / max * 100)}%;background:var(--gold)">${d.pendentes || 0}</div></div><div class="funil-pct">${d.inscritos ? Math.round((d.pendentes || 0) / d.inscritos * 100) + '%' : '—'}</div></div>
      <div class="funil-step"><div class="funil-label">Matriculados</div><div class="funil-bar-wrap"><div class="funil-bar" style="width:${Math.round((d.matriculados || 0) / max * 100)}%;background:var(--teal)">${d.matriculados || 0}</div></div><div class="funil-pct">${d.inscritos ? Math.round((d.matriculados || 0) / d.inscritos * 100) + '%' : '—'}</div></div>
    </div></div>`;
  });
  document.getElementById('ced-funil-full').innerHTML = html;
}

function cedtecRenderMatriculas() {
  const ced = getState('cedtec') || {};
  const _cedSge = ced.sge || [];
  const _cedMeta = ced.meta || {};
  const totalMatric = _cedSge.reduce((s, r) => s + (r.matriculados || 0), 0);
  const totalInsc = _cedSge.reduce((s, r) => s + (r.inscritos || 0), 0);
  const cpm = totalMatric > 0 && _cedMeta.gasto_mes > 0 ? _cedMeta.gasto_mes / totalMatric : 0;
  document.getElementById('ced-matric-stats').innerHTML = `
    <div class="stat-card green"><div><div class="stat-label">Matrículas total</div><div class="stat-value">${totalMatric}</div></div><div class="stat-ico">🎓</div></div>
    <div class="stat-card gold"><div><div class="stat-label">Custo / matrícula</div><div class="stat-value">${cpm > 0 ? fmtMoney(cpm) : '—'}</div></div><div class="stat-ico">💰</div></div>
    <div class="stat-card blue"><div><div class="stat-label">Taxa conversão</div><div class="stat-value">${totalInsc > 0 ? Math.round(totalMatric / totalInsc * 100) + '%' : '—'}</div></div><div class="stat-ico">📊</div></div>
  `;
  // By curso
  const cursoMap = {};
  _cedSge.forEach(r => { const k = r.curso || 'Geral'; if (!cursoMap[k]) cursoMap[k] = { i: 0, p: 0, m: 0 }; cursoMap[k].i += (r.inscritos || 0); cursoMap[k].p += (r.pendentes || 0); cursoMap[k].m += (r.matriculados || 0); });
  const rows = Object.entries(cursoMap);
  document.getElementById('ced-matric-body').innerHTML = rows.length ? rows.map(([c, d]) => `
    <tr><td style="font-weight:500;color:var(--white)">${esc(c)}</td><td>${d.i}</td><td>${d.p}</td><td style="font-weight:600;color:var(--teal)">${d.m}</td><td>${d.i > 0 ? Math.round(d.m / d.i * 100) + '%' : '—'}</td></tr>`).join('')
    : '<tr><td colspan="5" style="text-align:center;color:var(--text2);padding:24px">Sem dados — importe do SGE</td></tr>';
}

// CRUD
export function cedtecOpenRecarga() {
  const ced = getState('cedtec') || {};
  const _cedMeta = ced.meta || {};
  openModal('Registrar Recarga Meta', '', `
    <label class="m-label">Valor (R$)</label><input class="m-input" id="m-ced-rec-val" type="number" step="0.01" placeholder="0,00">
    <label class="m-label">Data</label><input class="m-input" id="m-ced-rec-data" type="date" value="${new Date().toISOString().split('T')[0]}">
    <label class="m-label">Notas (opcional)</label><input class="m-input" id="m-ced-rec-notas" placeholder="Ex: Pix Bradesco">
  `, [
    { label: 'Cancelar', cls: 'btn-cancel', action: closeModal },
    { label: 'Registrar', cls: 'btn-confirm', action: async () => {
      const val = parseFloat(document.getElementById('m-ced-rec-val').value);
      if (!val || val <= 0) { showToast('⚠️', 'Preencha o valor', ''); return; }
      await sb.from('cedtec_recargas').insert({ valor: val, data: document.getElementById('m-ced-rec-data').value, notas: document.getElementById('m-ced-rec-notas').value.trim() || null });
      // Update saldo
      await sb.from('cedtec_conta_meta').update({ saldo_atual: (_cedMeta.saldo_atual || 0) + val, atualizado_em: new Date().toISOString() }).eq('id', _cedMeta.id);
      closeModal(); await loadCedtec(); showToast('💳', 'Recarga registrada!', fmtMoney(val));
    }}
  ]);
}

export async function cedtecDeleteRecarga(id) {
  if (!confirm('Excluir recarga?')) return;
  const ced = getState('cedtec') || {};
  const _cedRecargas = ced.recargas || [];
  const _cedMeta = ced.meta || {};
  const rec = _cedRecargas.find(r => r.id === id);
  await sb.from('cedtec_recargas').delete().eq('id', id);
  if (rec) await sb.from('cedtec_conta_meta').update({ saldo_atual: Math.max((_cedMeta.saldo_atual || 0) - (rec.valor || 0), 0), atualizado_em: new Date().toISOString() }).eq('id', _cedMeta.id);
  await loadCedtec(); showToast('🗑️', 'Recarga excluída', '');
}

// ── MARCOS (Gestor de Tráfego IA) ────────────────────────
async function marcosInit() {
  // Load persona
  const { data: cfg } = await sb.from('configuracoes').select('valor').eq('chave', 'marcos_persona').single();
  const personaEl = document.getElementById('marcos-persona-txt');
  if (personaEl) personaEl.value = cfg?.valor || MARCOS_DEFAULT_PERSONA;
  // Collapse state
  const expanded = localStorage.getItem('marcos-persona-expanded') === 'true';
  const area = document.getElementById('marcos-persona-area');
  if (area) area.style.display = expanded ? 'block' : 'none';
  // Input handlers
  const ta = document.getElementById('marcos-ta');
  const btn = document.getElementById('marcos-send-btn');
  if (ta) {
    ta.oninput = function () { this.style.height = 'auto'; this.style.height = Math.min(this.scrollHeight, 100) + 'px'; btn.disabled = !this.value.trim(); };
    ta.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); marcosSendMsg(); } };
  }
  // Load history
  const { data: hist } = await sb.from('chat_mensagens').select('*').eq('contexto', 'marcos').order('criado_em', { ascending: true }).limit(50);
  if (hist && hist.length) {
    document.getElementById('marcos-empty').style.display = 'none';
    document.getElementById('marcos-chips').style.display = 'none';
    hist.forEach(m => {
      marcosAppendMsg(m.role === 'user' ? 'u' : 'a', m.conteudo, m.criado_em);
      _marcosHistory.push({ role: m.role, content: m.conteudo });
    });
  }
  // Raw data table
  marcosRenderRawData();
  // Dynamic suggestions
  marcosLoadSuggestions();
}

function marcosRenderRawData() {
  const ced = getState('cedtec') || {};
  const _cedMetaCamp = ced.metaCamp || [];
  const el = document.getElementById('marcos-raw-table');
  if (!el) return;
  const syncEl = document.getElementById('marcos-raw-sync');
  if (_cedMetaCamp.length && _cedMetaCamp[0].sincronizado_em) {
    syncEl.textContent = fmtDate(_cedMetaCamp[0].sincronizado_em) + ' ' + new Date(_cedMetaCamp[0].sincronizado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  if (!_cedMetaCamp.length) { el.innerHTML = '<div style="padding:12px;color:var(--text2)">Nenhum dado — sincronize primeiro</div>'; return; }
  el.innerHTML = `<table class="tbl-hdr" style="width:100%;font-size:12px"><thead><tr><th>Campanha</th><th>Status</th><th>Objetivo</th><th>Gasto</th><th>Reach</th><th>Freq</th><th>Leads</th><th>Msgs</th><th>Raw</th></tr></thead><tbody>` +
    _cedMetaCamp.map(c => {
      const hasRaw = !!c.raw_data;
      return `<tr><td style="color:var(--white);font-weight:500;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.nome)}</td>
      <td>${c.status}</td><td style="font-size:10px">${c.objetivo || '—'}</td>
      <td>${fmtMoney(parseFloat(c.gasto) || 0)}</td><td>${(c.reach || 0).toLocaleString('pt-BR')}</td><td>${(parseFloat(c.frequency) || 0).toFixed(1)}</td>
      <td>${c.conversoes || 0}</td><td>${c.messages_count || 0}</td>
      <td>${hasRaw ? `<span style="cursor:pointer" onclick="marcosShowRaw('${c.campaign_id}')">📋</span>` : '—'}</td></tr>`;
    }).join('') + '</tbody></table>';
}

export function marcosShowRaw(campId) {
  const ced = getState('cedtec') || {};
  const _cedMetaCamp = ced.metaCamp || [];
  const c = _cedMetaCamp.find(x => x.campaign_id === campId);
  if (!c?.raw_data) return;
  openModal('Raw JSON — ' + esc(c.nome), '', `<pre style="background:var(--bg);padding:12px;border-radius:var(--r-sm);overflow:auto;max-height:60vh;font-size:11px;color:var(--text);white-space:pre-wrap">${esc(JSON.stringify(c.raw_data, null, 2))}</pre>`, [
    { label: 'Copiar', cls: 'btn-action', action: () => { navigator.clipboard.writeText(JSON.stringify(c.raw_data, null, 2)); showToast('📋', 'JSON copiado', ''); } },
    { label: 'Fechar', cls: 'btn-confirm', action: closeModal }
  ]);
}

async function marcosLoadSuggestions() {
  const ced = getState('cedtec') || {};
  const _cedMetaCamp = ced.metaCamp || [];
  if (!_cedMetaCamp.length) return;
  try {
    const ativas = _cedMetaCamp.filter(c => c.status === 'ACTIVE');
    if (!ativas.length) return;
    const resumo = ativas.map(c => `${c.nome}: R$${(parseFloat(c.gasto) || 0).toFixed(0)}, ${c.conversoes || 0}L ${c.messages_count || 0}M`).join('; ');
    const { data: { session } } = await sb.auth.getSession();
    const res = await fetch(SURL + '/functions/v1/chat-claude', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (session?.access_token || '') },
      body: JSON.stringify({ messages: [{ role: 'user', content: `Dados atuais: ${resumo}. Sugira exatamente 3 perguntas curtas (máx 6 palavras cada) que o Pedro deveria fazer agora. Retorne APENAS um JSON array: ["pergunta1","pergunta2","pergunta3"]` }], marcos: true, marcosPersona: 'Retorne apenas JSON array com 3 strings curtas.', marcosContext: '' })
    });
    const data = await res.json();
    const match = data.reply?.match(/\[[\s\S]*?\]/);
    if (match) {
      const suggestions = JSON.parse(match[0]);
      const chipsEl = document.getElementById('marcos-chips');
      if (chipsEl && suggestions.length) {
        chipsEl.innerHTML = suggestions.map(s => `<div class="chip" onclick="marcosSendQuick('${esc(s)}')">${esc(s)}</div>`).join('');
      }
    }
  } catch (e) { console.log('[Marcos] Suggestions error:', e); }
}

function marcosAppendMsg(role, text, ts) {
  const msgs = document.getElementById('marcos-msgs');
  const div = document.createElement('div');
  div.className = 'msg ' + role;
  const t = ts ? new Date(ts) : new Date();
  const now = t.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const content = role === 'u' ? esc(text).replace(/\n/g, '<br>') : renderMarkdown(text);
  const vaultBtn = role === 'a' ? `<span style="cursor:pointer;font-size:11px;color:var(--text3);margin-left:6px" title="Salvar no vault" onclick="marcosManualSave(this.parentElement.previousElementSibling.innerText)">📓</span>` : '';
  div.innerHTML = `<div class="bubble">${content}</div><div class="msg-t"><span style="font-size:10px;background:rgba(139,92,246,.15);color:var(--purple);padding:2px 7px;border-radius:8px;font-weight:600">🧑‍💼 Marcos</span> ${now}${vaultBtn}</div>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

export function marcosSendQuick(text) {
  document.getElementById('marcos-ta').value = text;
  document.getElementById('marcos-send-btn').disabled = false;
  marcosSendMsg();
}

export async function marcosSendMsg() {
  if (_marcosSending) return;
  const ced = getState('cedtec') || {};
  const _cedMetaCamp = ced.metaCamp || [];
  const _cedSge = ced.sge || [];
  const _cedMeta = ced.meta || {};
  const ta = document.getElementById('marcos-ta');
  const text = ta.value.trim(); if (!text) return;
  document.getElementById('marcos-empty').style.display = 'none';
  document.getElementById('marcos-chips').style.display = 'none';
  marcosAppendMsg('u', text);
  ta.value = ''; ta.style.height = 'auto'; document.getElementById('marcos-send-btn').disabled = true;
  _marcosHistory.push({ role: 'user', content: text });
  _marcosSending = true;
  const typing = document.createElement('div'); typing.className = 'typing';
  typing.innerHTML = '<div class="td"></div><div class="td"></div><div class="td"></div>';
  document.getElementById('marcos-msgs').appendChild(typing);

  try {
    const { data: { session } } = await sb.auth.getSession();
    const token = session?.access_token || '';
    // Build context with raw data
    const ativasRaw = _cedMetaCamp.filter(c => c.status === 'ACTIVE').map(c => {
      const raw = c.raw_data || {};
      return { nome: c.nome, gasto: c.gasto, leads: c.conversoes, messages: c.messages_count, impressoes: c.impressoes, cliques: c.cliques, ctr: c.ctr, cpc: c.cpc, reach: c.reach, frequency: c.frequency, objetivo: c.objetivo, actions: raw.insights?.actions || [], adsets: (raw.adsets || []).map(a => ({ nome: a.name, targeting: a.targeting, optimization: a.optimization_goal })), ads_count: (raw.ads || []).length };
    });
    const funilData = _cedSge.slice(0, 5).map(s => ({ curso: s.curso, inscritos: s.inscritos, pendentes: s.pendentes, matriculados: s.matriculados }));
    const saldoInfo = { saldo: _cedMeta?.saldo_atual || 0, gasto_mes: _cedMeta?.gasto_mes || 0 };
    const ctx = `[CONTEXTO CEDTEC - ${new Date().toISOString().split('T')[0]}]\n\nCampanhas ativas (raw):\n${JSON.stringify(ativasRaw, null, 1)}\n\nFunil SGE:\n${JSON.stringify(funilData)}\n\nSaldo: ${JSON.stringify(saldoInfo)}`;
    const persona = document.getElementById('marcos-persona-txt')?.value || MARCOS_DEFAULT_PERSONA;
    const res = await fetch(SURL + '/functions/v1/chat-claude', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ messages: _marcosHistory, marcos: true, marcosPersona: persona, marcosContext: ctx })
    });
    const data = await res.json();
    typing.remove();
    const reply = data.reply || 'Sem resposta.';
    marcosAppendMsg('a', reply);
    _marcosHistory.push({ role: 'assistant', content: reply });
    // Save to DB
    await sb.from('chat_mensagens').insert({ role: 'user', conteudo: text, contexto: 'marcos' });
    await sb.from('chat_mensagens').insert({ role: 'assistant', conteudo: reply, contexto: 'marcos' });
    // Auto vault save
    if (data.vault_save) await marcosVaultSave(data.vault_save.path, data.vault_save.content);
  } catch (e) { typing.remove(); marcosAppendMsg('a', '⚠️ Erro: ' + e.message); }
  _marcosSending = false;
}

export async function marcosSavePersona() {
  const val = document.getElementById('marcos-persona-txt').value.trim();
  await sb.from('configuracoes').upsert({ chave: 'marcos_persona', valor: val, updated_at: new Date().toISOString() });
  showToast('💾', 'Persona salva!', '');
}

export function marcosRestorePersona() {
  document.getElementById('marcos-persona-txt').value = MARCOS_DEFAULT_PERSONA;
  showToast('↩️', 'Persona restaurada', 'Clique Salvar para confirmar');
}

async function marcosVaultSave(path, content) {
  try {
    const { data: { session } } = await sb.auth.getSession();
    // This would call a vault-save edge function or GitHub API
    // For now, save as note in chat
    console.log('[Marcos Vault] Would save to:', path, content?.substring(0, 50));
  } catch (e) { console.error('[Marcos Vault]', e); }
}

export function marcosManualSave(text) {
  const today = new Date().toISOString().split('T')[0];
  openModal('Salvar no Vault', '', `
    <label class="m-label">Caminho</label><input class="m-input" id="m-vault-path" value="marcos/insights/${today}.md">
    <label class="m-label">Conteúdo</label><textarea class="m-textarea" id="m-vault-content" rows="6">${esc(text)}</textarea>
  `, [
    { label: 'Cancelar', cls: 'btn-cancel', action: closeModal },
    { label: 'Salvar', cls: 'btn-confirm', action: async () => {
      await marcosVaultSave(document.getElementById('m-vault-path').value, document.getElementById('m-vault-content').value);
      closeModal(); showToast('📓', 'Salvo no vault!', '');
    }}
  ]);
}

export async function cedtecSyncMeta() {
  const btn = document.getElementById('ced-sync-btn');
  const btn2 = document.getElementById('ced-sync-btn2');
  btn.textContent = '⏳ Sincronizando...'; btn.style.pointerEvents = 'none';
  if (btn2) { btn2.textContent = '⏳ Sincronizando...'; btn2.style.pointerEvents = 'none'; }
  try {
    const { data: { session } } = await sb.auth.getSession();
    const token = session?.access_token || '';
    const res = await fetch(SURL + '/functions/v1/meta-sync', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }, body: '{}'
    });
    const data = await res.json();
    if (data.error) { showToast('❌', 'Erro na sincronização', data.error); btn.textContent = '🔄 Sincronizar Meta'; btn.style.pointerEvents = ''; return; }
    showToast('✅', `${data.synced} campanhas sincronizadas`, '');
    await loadCedtec();
  } catch (e) { showToast('❌', 'Erro de conexão', e.message); }
  btn.textContent = '🔄 Sincronizar Meta'; btn.style.pointerEvents = '';
  if (btn2) { btn2.textContent = '🔄 Sincronizar agora'; btn2.style.pointerEvents = ''; }
}

function cedtecRenderTrend() {
  const _cedMetaCamp = getFilteredCampaigns();
  const ctx = document.getElementById('ced-trend-chart');
  if (!ctx) return;
  // Use meta cache campaigns — aggregate spend and leads by campaign
  const camps = _cedMetaCamp.filter(c => parseFloat(c.gasto) > 0);
  if (!camps.length) {
    if (_cedTrendChart) { _cedTrendChart.destroy(); _cedTrendChart = null; }
    return;
  }
  const labels = camps.map(c => esc(c.nome || '').substring(0, 20));
  const gastoData = camps.map(c => parseFloat(c.gasto) || 0);
  const leadsData = camps.map(c => c.conversoes || 0);
  if (_cedTrendChart) _cedTrendChart.destroy();
  _cedTrendChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [
      { label: 'Gasto (R$)', data: gastoData, backgroundColor: 'rgba(232,83,63,.6)', borderRadius: 4, yAxisID: 'y' },
      { label: 'Leads', data: leadsData, backgroundColor: 'rgba(0,201,167,.7)', borderRadius: 4, yAxisID: 'y1' }
    ]},
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#6B7A99', font: { size: 11 } } }, tooltip: { backgroundColor: '#1E2435', titleColor: '#EEF2FF', bodyColor: '#C8D0E0' } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#6B7A99', font: { size: 10 }, maxRotation: 45 } },
        y: { position: 'left', grid: { color: 'rgba(42,49,72,.5)' }, ticks: { color: '#6B7A99', font: { size: 11 }, callback: v => 'R$' + v } },
        y1: { position: 'right', grid: { display: false }, ticks: { color: '#00C9A7', font: { size: 11 } } }
      }
    }
  });
}
