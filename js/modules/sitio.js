// ── Sitio Monte da Vitoria — Cost Centers, Transactions, Charts ──

import { sb } from '../core/supabase.js';
import { getState, setState } from '../core/store.js';
import { openModal, closeModal } from '../core/modal.js';
import { showToast } from '../core/toast.js';
import { esc, fmtDate, fmtMoney } from '../core/utils.js';

let _sitioCronoChart = null, _sitioPieChart = null;
let _sitioAttachFile = null;

export function sitioTab(tab) {
  ['visao', 'lanc', 'centros', 'crono', 'relat'].forEach(t => {
    const el = document.getElementById('sitio-' + t);
    if (el) el.style.display = t === tab ? '' : 'none';
  });
  document.querySelectorAll('#sitio-tabs .ptab').forEach(p => {
    p.classList.toggle('on', p.dataset.tab === tab);
  });
  if (tab === 'crono') sitioRenderCrono();
  if (tab === 'relat') sitioRenderRelat();
}

export async function loadSitio() {
  const [{ data: centros }, { data: lancs }] = await Promise.all([
    sb.from('sitio_categorias').select('*').order('nome'),
    sb.from('sitio_lancamentos').select('*').order('data_realizada', { ascending: false }).limit(500)
  ]);
  setState('sitio', { centros: centros || [], lancamentos: lancs || [] });
  // Populate filter
  const sel = document.getElementById('sitio-filter-centro');
  if (sel) {
    sel.innerHTML = '<option value="">Todos centros</option>';
    (centros || []).forEach(c => {
      sel.innerHTML += `<option value="${c.id}">${c.icone || ''} ${esc(c.nome)}</option>`;
    });
  }
  sitioRenderVisao();
  sitioRenderLancs();
  sitioRenderCentrosGrid();
}

function sitioRenderVisao() {
  const { centros: _sitioCentros, lancamentos: _sitioLancs } = getState('sitio') || { centros: [], lancamentos: [] };
  const lancs = _sitioLancs.filter(l => l.tipo === 'realizado' || l.tipo === 'gasto');
  const total = lancs.reduce((s, l) => s + (parseFloat(l.valor) || 0), 0);
  const now = new Date();
  const mesLancs = lancs.filter(l => { const d = new Date(l.data_realizada || l.data_lancamento); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
  const mesTotal = mesLancs.reduce((s, l) => s + (parseFloat(l.valor) || 0), 0);
  const plan = _sitioLancs.filter(l => l.tipo === 'planejado');
  const future = new Date(); future.setDate(future.getDate() + 90);
  const planTotal = plan.filter(l => { const d = new Date(l.data_prevista || l.data_lancamento); return d >= now && d <= future; }).reduce((s, l) => s + (parseFloat(l.valor) || 0), 0);
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  document.getElementById('sitio-total').textContent = fmtMoney(total);
  document.getElementById('sitio-mes').textContent = fmtMoney(mesTotal);
  document.getElementById('sitio-mes-label').textContent = months[now.getMonth()] + ' ' + now.getFullYear();
  document.getElementById('sitio-plan').textContent = fmtMoney(planTotal);
  document.getElementById('sitio-centros-count').textContent = _sitioCentros.length;

  // Bars por centro
  const maxVal = Math.max(..._sitioCentros.map(c => lancs.filter(l => l.centro_custo_id === c.id).reduce((s, l) => s + (parseFloat(l.valor) || 0), 0)), 1);
  const barsHtml = _sitioCentros.map(c => {
    const val = lancs.filter(l => l.centro_custo_id === c.id).reduce((s, l) => s + (parseFloat(l.valor) || 0), 0);
    const pct = Math.round(val / maxVal * 100);
    return `<div class="sitio-bar-row">
      <div class="sitio-bar-label">${c.icone || ''} ${esc(c.nome)}</div>
      <div class="sitio-bar-track"><div class="sitio-bar-fill" style="width:${pct}%;background:${c.cor || 'var(--teal)'}">${pct > 15 ? fmtMoney(val) : ''}</div></div>
      <div class="sitio-bar-val">${fmtMoney(val)}</div>
    </div>`;
  }).join('');
  document.getElementById('sitio-centros-bars').innerHTML = barsHtml || '<div style="padding:20px;color:var(--text2);text-align:center">Nenhum centro de custo</div>';

  // Recent
  const recent = _sitioLancs.slice(0, 8);
  document.getElementById('sitio-recent').innerHTML = recent.length ? recent.map(l => {
    const centro = _sitioCentros.find(c => c.id === l.centro_custo_id);
    const tipoTag = l.tipo === 'planejado' ? '<span class="badge gold">Planejado</span>' : '<span class="badge green">Realizado</span>';
    return `<div class="sitio-recent-item">
      <span style="font-size:16px">${centro?.icone || '💰'}</span>
      <div style="flex:1;min-width:0"><div style="color:var(--white);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(l.descricao)}</div><div style="font-size:11px;color:var(--text2)">${centro?.nome || '—'} · ${fmtDate(l.data_realizada || l.data_prevista || l.data_lancamento)}</div></div>
      <div style="text-align:right"><div style="font-weight:600;color:var(--white)">${fmtMoney(parseFloat(l.valor) || 0)}</div>${tipoTag}</div>
    </div>`;
  }).join('') : '<div style="padding:20px;color:var(--text2);text-align:center">Nenhum lançamento</div>';
}

export function sitioRenderLancs() {
  const { centros: _sitioCentros, lancamentos: _sitioLancs } = getState('sitio') || { centros: [], lancamentos: [] };
  const filtCentro = document.getElementById('sitio-filter-centro')?.value || '';
  const filtTipo = document.getElementById('sitio-filter-tipo')?.value || '';
  let lancs = [..._sitioLancs];
  if (filtCentro) lancs = lancs.filter(l => l.centro_custo_id === filtCentro);
  if (filtTipo) lancs = lancs.filter(l => l.tipo === filtTipo);
  const body = document.getElementById('sitio-lancs-body');
  if (!lancs.length) { body.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text2);padding:24px">Nenhum lançamento encontrado.</td></tr>'; return; }
  body.innerHTML = lancs.map(l => {
    const centro = _sitioCentros.find(c => c.id === l.centro_custo_id);
    const dt = l.data_realizada || l.data_prevista || l.data_lancamento;
    const tipoTag = l.tipo === 'planejado' ? '<span class="badge gold">Planejado</span>' : '<span class="badge green">Realizado</span>';
    const clipIco = l.comprovante_url ? `<span style="cursor:pointer;font-size:14px" title="Ver comprovante" onclick="event.stopPropagation();sitioViewAttach('${l.id}')">📎</span>` : '';
    return `<tr>
      <td style="max-width:200px"><div style="font-weight:500;color:var(--white)">${esc(l.descricao)} ${clipIco}</div>${l.notas ? '<div style="font-size:11px;color:var(--text2)">' + esc(l.notas) + '</div>' : ''}</td>
      <td><span style="display:inline-flex;align-items:center;gap:4px">${centro ? '<span style="width:8px;height:8px;border-radius:50%;background:' + (centro.cor || 'var(--teal)') + '"></span> ' + esc(centro.nome) : '—'}</span></td>
      <td style="font-weight:600">${fmtMoney(parseFloat(l.valor) || 0)}</td>
      <td>${dt ? fmtDate(dt) : '—'}</td>
      <td>${tipoTag}</td>
      <td><span style="cursor:pointer" onclick="event.stopPropagation();sitioOpenEditLanc('${l.id}')">✏️</span> <span style="cursor:pointer" onclick="event.stopPropagation();sitioDeleteLanc('${l.id}','${esc(l.descricao)}')">🗑️</span></td>
    </tr>`;
  }).join('');
}

function sitioRenderCentrosGrid() {
  const { centros: _sitioCentros, lancamentos: _sitioLancs } = getState('sitio') || { centros: [], lancamentos: [] };
  const grid = document.getElementById('sitio-centros-grid');
  const lancs = _sitioLancs.filter(l => l.tipo === 'realizado' || l.tipo === 'gasto');
  grid.innerHTML = _sitioCentros.map(c => {
    const val = lancs.filter(l => l.centro_custo_id === c.id).reduce((s, l) => s + (parseFloat(l.valor) || 0), 0);
    const count = lancs.filter(l => l.centro_custo_id === c.id).length;
    return `<div class="sitio-centro-card" onclick="sitioOpenEditCentro('${c.id}')">
      <div class="sitio-centro-dot" style="background:${c.cor || 'var(--teal)'}"></div>
      <div class="sitio-centro-ico">${c.icone || '🏷️'}</div>
      <div class="sitio-centro-name">${esc(c.nome)}</div>
      <div class="sitio-centro-tipo">${c.tipo || 'geral'} · ${count} lanç.</div>
      <div class="sitio-centro-valor">${fmtMoney(val)}</div>
    </div>`;
  }).join('') || '<div class="doc-empty">Nenhum centro de custo</div>';
}

function sitioRenderCrono() {
  const { centros: _sitioCentros, lancamentos: _sitioLancs } = getState('sitio') || { centros: [], lancamentos: [] };
  const ctx = document.getElementById('sitio-crono-chart');
  if (!ctx) return;
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const now = new Date();
  const labels = [], realizados = [], planejados = [];
  for (let i = -5; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const key = d.toISOString().slice(0, 7);
    labels.push(months[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2));
    realizados.push(_sitioLancs.filter(l => (l.tipo === 'realizado' || l.tipo === 'gasto') && (l.data_realizada || l.data_lancamento || '').startsWith(key)).reduce((s, l) => s + (parseFloat(l.valor) || 0), 0));
    planejados.push(_sitioLancs.filter(l => l.tipo === 'planejado' && (l.data_prevista || '').startsWith(key)).reduce((s, l) => s + (parseFloat(l.valor) || 0), 0));
  }
  if (_sitioCronoChart) _sitioCronoChart.destroy();
  _sitioCronoChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [
      { label: 'Realizado', data: realizados, backgroundColor: 'rgba(0,201,167,.7)', borderRadius: 4 },
      { label: 'Planejado', data: planejados, backgroundColor: 'rgba(245,166,35,.5)', borderRadius: 4 }
    ] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#6B7A99', font: { size: 11 } } }, tooltip: { backgroundColor: '#1E2435', titleColor: '#EEF2FF', bodyColor: '#C8D0E0' } }, scales: { x: { grid: { display: false }, ticks: { color: '#6B7A99', font: { size: 11 } } }, y: { grid: { color: 'rgba(42,49,72,.5)' }, ticks: { color: '#6B7A99', font: { size: 11 }, callback: v => fmtMoney(v) } } } }
  });
}

function sitioRenderRelat() {
  const { centros: _sitioCentros, lancamentos: _sitioLancs } = getState('sitio') || { centros: [], lancamentos: [] };
  const ctx = document.getElementById('sitio-pie-chart');
  if (!ctx) return;
  const lancs = _sitioLancs.filter(l => l.tipo === 'realizado' || l.tipo === 'gasto');
  const labels = [], vals = [], colors = [];
  _sitioCentros.forEach(c => {
    const v = lancs.filter(l => l.centro_custo_id === c.id).reduce((s, l) => s + (parseFloat(l.valor) || 0), 0);
    if (v > 0) { labels.push(c.nome); vals.push(v); colors.push(c.cor || '#6B7A99'); }
  });
  const semCentro = lancs.filter(l => !l.centro_custo_id).reduce((s, l) => s + (parseFloat(l.valor) || 0), 0);
  if (semCentro > 0) { labels.push('Sem centro'); vals.push(semCentro); colors.push('#3A4460'); }
  if (!vals.length) { labels.push('Sem dados'); vals.push(1); colors.push('#2A3148'); }
  if (_sitioPieChart) _sitioPieChart.destroy();
  const bgColor = getComputedStyle(document.documentElement).getPropertyValue('--card').trim() || '#1E2435';
  _sitioPieChart = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data: vals, backgroundColor: colors, borderColor: bgColor, borderWidth: 2 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#6B7A99', font: { size: 11 }, padding: 10, boxWidth: 12 } }, tooltip: { callbacks: { label: ctx => ctx.label + ': ' + fmtMoney(ctx.raw) } } } }
  });
  // Resumo
  const total = lancs.reduce((s, l) => s + (parseFloat(l.valor) || 0), 0);
  const planTotal = _sitioLancs.filter(l => l.tipo === 'planejado').reduce((s, l) => s + (parseFloat(l.valor) || 0), 0);
  document.getElementById('sitio-resumo').innerHTML = `
    <div style="padding:8px 12px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between"><span style="color:var(--text2)">Total realizado</span><span style="font-weight:600;color:var(--white)">${fmtMoney(total)}</span></div>
    <div style="padding:8px 12px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between"><span style="color:var(--text2)">Total planejado</span><span style="font-weight:600;color:var(--gold)">${fmtMoney(planTotal)}</span></div>
    <div style="padding:8px 12px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between"><span style="color:var(--text2)">Lançamentos</span><span style="font-weight:600;color:var(--white)">${_sitioLancs.length}</span></div>
    <div style="padding:8px 12px;display:flex;justify-content:space-between"><span style="color:var(--text2)">Centros de custo</span><span style="font-weight:600;color:var(--white)">${_sitioCentros.length}</span></div>
  `;
}

// ── CRUD Centros ──

export function sitioOpenNewCentro() {
  openModal('Novo Centro de Custo', '', `
    <label class="m-label">Nome</label><input class="m-input" id="m-sc-nome" placeholder="Ex: Lavoura - Banana">
    <label class="m-label">Icone</label>
    <div class="ico-grid" id="m-sc-icos"></div>
    <input type="hidden" id="m-sc-ico" value="🏷️">
    <label class="m-label">Tipo</label>
    <select class="m-select" id="m-sc-tipo"><option value="lavoura">Lavoura</option><option value="obra">Obra</option><option value="infra">Infraestrutura</option><option value="terreno">Terreno</option><option value="geral">Geral</option></select>
    <label class="m-label">Cor</label>
    <div class="color-opts" id="m-sc-cores"></div>
    <input type="hidden" id="m-sc-cor" value="#00C9A7">
  `, [
    { label: 'Cancelar', cls: 'btn-cancel', action: closeModal },
    { label: 'Criar', cls: 'btn-confirm', action: async () => {
      const nome = document.getElementById('m-sc-nome').value.trim();
      if (!nome) { showToast('⚠️', 'Preencha o nome', ''); return; }
      await sb.from('sitio_categorias').insert({ nome, icone: document.getElementById('m-sc-ico').value || '🏷️', tipo: document.getElementById('m-sc-tipo').value, cor: document.getElementById('m-sc-cor').value });
      closeModal(); await loadSitio(); showToast('✅', 'Centro criado!', '');
    } }
  ]);
  renderIconPicker('m-sc-icos', 'm-sc-ico', '🏷️');
  renderColorPicker('m-sc-cores', 'm-sc-cor', '#00C9A7');
}

export function sitioOpenEditCentro(id) {
  const { centros: _sitioCentros, lancamentos: _sitioLancs } = getState('sitio') || { centros: [], lancamentos: [] };
  const c = _sitioCentros.find(x => x.id === id);
  if (!c) return;
  openModal('Editar Centro de Custo', '', `
    <label class="m-label">Nome</label><input class="m-input" id="m-sc-nome" value="${esc(c.nome)}">
    <label class="m-label">Icone</label>
    <div class="ico-grid" id="m-sc-icos"></div>
    <input type="hidden" id="m-sc-ico" value="${c.icone || '🏷️'}">
    <label class="m-label">Tipo</label>
    <select class="m-select" id="m-sc-tipo"><option value="lavoura" ${c.tipo === 'lavoura' ? 'selected' : ''}>Lavoura</option><option value="obra" ${c.tipo === 'obra' ? 'selected' : ''}>Obra</option><option value="infra" ${c.tipo === 'infra' ? 'selected' : ''}>Infraestrutura</option><option value="terreno" ${c.tipo === 'terreno' ? 'selected' : ''}>Terreno</option><option value="geral" ${c.tipo === 'geral' ? 'selected' : ''}>Geral</option></select>
    <label class="m-label">Cor</label>
    <div class="color-opts" id="m-sc-cores"></div>
    <input type="hidden" id="m-sc-cor" value="${c.cor || '#00C9A7'}">
  `, [
    { label: 'Excluir', cls: 'btn-cancel', style: 'color:var(--red2)', action: async () => {
      const has = _sitioLancs.some(l => l.centro_custo_id === id);
      if (has) { showToast('⚠️', 'Centro tem lançamentos vinculados', 'Remova-os primeiro'); return; }
      if (!confirm('Excluir "' + c.nome + '"?')) return;
      await sb.from('sitio_categorias').delete().eq('id', id);
      closeModal(); await loadSitio(); showToast('🗑️', 'Centro excluido', '');
    } },
    { label: 'Salvar', cls: 'btn-confirm', action: async () => {
      const nome = document.getElementById('m-sc-nome').value.trim();
      if (!nome) return;
      await sb.from('sitio_categorias').update({ nome, icone: document.getElementById('m-sc-ico').value || '🏷️', tipo: document.getElementById('m-sc-tipo').value, cor: document.getElementById('m-sc-cor').value }).eq('id', id);
      closeModal(); await loadSitio(); showToast('✅', 'Centro atualizado!', '');
    } }
  ]);
  renderIconPicker('m-sc-icos', 'm-sc-ico', c.icone || '🏷️');
  renderColorPicker('m-sc-cores', 'm-sc-cor', c.cor || '#00C9A7');
}

export function renderIconPicker(containerId, inputId, selected) {
  const icons = ['🌱', '🌿', '🌾', '🏔️', '🪨', '🌳', '🌲', '🍃', '🏠', '🏗️', '🏚️', '🪵', '🧱', '🔨', '🪟', '🚪', '🔧', '⚡', '💧', '🛣️', '🚜', '⛏️', '🪣', '🔩', '☕', '🫒', '🌻', '🌽', '🍅', '🫘', '🍵', '🏷️', '💰', '📋', '🗂️', '📦', '🚛', '🔑', '📐', '🗃️'];
  const cont = document.getElementById(containerId);
  cont.innerHTML = icons.map(i => `<div class="ico-opt${i === selected ? ' sel' : ''}" onclick="document.getElementById('${inputId}').value='${i}';document.querySelectorAll('#${containerId} .ico-opt').forEach(x=>x.classList.remove('sel'));this.classList.add('sel')">${i}</div>`).join('');
}

export function renderColorPicker(containerId, inputId, selected) {
  const cols = ['#639922', '#378ADD', '#D85A30', '#1D9E75', '#7F77DD', '#888780', '#00C9A7', '#F5A623', '#E8533F', '#8B5CF6', '#22C55E', '#4A90D9'];
  const cont = document.getElementById(containerId);
  cont.innerHTML = cols.map(c => `<div class="color-opt${c === selected ? ' sel' : ''}" style="background:${c}" onclick="document.getElementById('${inputId}').value='${c}';document.querySelectorAll('#${containerId} .color-opt').forEach(x=>x.classList.remove('sel'));this.classList.add('sel')"></div>`).join('');
}

// ── Attachments ──

function sitioAttachSection(existingUrl) {
  const preview = existingUrl ? `<div id="m-sl-attach-preview" style="margin-top:6px"><a href="${existingUrl}" target="_blank" style="color:var(--teal);font-size:12px">📎 Ver comprovante atual</a> <span style="cursor:pointer;color:var(--red2);font-size:11px" onclick="document.getElementById('m-sl-attach-preview').remove();document.getElementById('m-sl-remove-attach').value='1'">✕ remover</span></div><input type="hidden" id="m-sl-remove-attach" value="0">` : '<input type="hidden" id="m-sl-remove-attach" value="0">';
  return `
    <label class="m-label">Comprovante / Anexo</label>
    <div class="row" style="gap:6px;flex-wrap:wrap">
      <div class="btn-action" onclick="document.getElementById('m-sl-file').click()">📁 Arquivo</div>
      <div class="btn-action" onclick="document.getElementById('m-sl-camera').click()">📷 Foto</div>
    </div>
    <input type="file" id="m-sl-file" accept=".jpg,.jpeg,.png,.pdf,.heic" style="display:none" onchange="sitioPreviewAttach(this)">
    <input type="file" id="m-sl-camera" accept="image/*" capture="environment" style="display:none" onchange="sitioPreviewAttach(this)">
    <div id="m-sl-attach-area" style="margin-top:6px">${preview}</div>`;
}

export function sitioPreviewAttach(input) {
  const file = input.files?.[0];
  if (!file) return;
  _sitioAttachFile = file;
  const area = document.getElementById('m-sl-attach-area');
  const isPdf = file.name.toLowerCase().endsWith('.pdf');
  if (isPdf) {
    area.innerHTML = `<div style="display:flex;align-items:center;gap:8px;padding:8px;background:var(--bg);border-radius:var(--r-sm);border:1px solid var(--border)"><span style="font-size:20px">📄</span><span style="font-size:12px;color:var(--white)">${esc(file.name)}</span><span style="cursor:pointer;color:var(--red2);font-size:11px" onclick="_sitioAttachFile=null;this.parentElement.remove()">✕</span></div>`;
  } else {
    const url = URL.createObjectURL(file);
    area.innerHTML = `<div style="position:relative;display:inline-block"><img src="${url}" style="max-height:100px;border-radius:var(--r-sm);border:1px solid var(--border)"><span style="position:absolute;top:2px;right:2px;cursor:pointer;background:rgba(0,0,0,.6);border-radius:50%;width:18px;height:18px;display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff" onclick="_sitioAttachFile=null;this.parentElement.remove()">✕</span></div>`;
  }
}

async function sitioUploadAttach() {
  if (!_sitioAttachFile) return null;
  const { data: { session } } = await sb.auth.getSession();
  const uid = session?.user?.id || 'user';
  const path = `sitio/comprovantes/${uid}/${Date.now()}_${_sitioAttachFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const { data, error } = await sb.storage.from('documentos').upload(path, _sitioAttachFile, { upsert: false });
  if (error) { console.error('Erro upload comprovante:', error); showToast('❌', 'Erro no upload', error.message); return null; }
  _sitioAttachFile = null;
  return data.path;
}

// ── CRUD Lancamentos ──

export function sitioOpenNewLanc() {
  _sitioAttachFile = null;
  const { centros: _sitioCentros } = getState('sitio') || { centros: [] };
  const centroOpts = _sitioCentros.map(c => `<option value="${c.id}">${c.icone || ''} ${esc(c.nome)}</option>`).join('');
  openModal('Novo Lançamento', '', `
    <label class="m-label">Descrição</label><input class="m-input" id="m-sl-desc" placeholder="Ex: Compra de mudas de cafe">
    <label class="m-label">Centro de custo</label>
    <select class="m-select" id="m-sl-centro"><option value="">Sem centro</option>${centroOpts}</select>
    <label class="m-label">Valor (R$)</label><input class="m-input" id="m-sl-valor" type="number" step="0.01" placeholder="0,00">
    <label class="m-label">Tipo</label>
    <select class="m-select" id="m-sl-tipo"><option value="realizado">Realizado</option><option value="planejado">Planejado</option></select>
    <label class="m-label">Data</label><input class="m-input" id="m-sl-data" type="date">
    <label class="m-label">Notas (opcional)</label><textarea class="m-textarea" id="m-sl-notas" rows="2" placeholder="Observações..."></textarea>
    ${sitioAttachSection(null)}
  `, [
    { label: 'Cancelar', cls: 'btn-cancel', action: closeModal },
    { label: 'Criar', cls: 'btn-confirm', action: async () => {
      const descricao = document.getElementById('m-sl-desc').value.trim();
      if (!descricao) { showToast('⚠️', 'Preencha a descrição', ''); return; }
      const tipo = document.getElementById('m-sl-tipo').value;
      const dt = document.getElementById('m-sl-data').value || null;
      const comprovante = await sitioUploadAttach();
      const ins = { descricao, centro_custo_id: document.getElementById('m-sl-centro').value || null, valor: parseFloat(document.getElementById('m-sl-valor').value) || 0, tipo, data_realizada: tipo === 'realizado' ? dt : null, data_prevista: tipo === 'planejado' ? dt : null, data_lancamento: dt, notas: document.getElementById('m-sl-notas').value.trim() || null };
      if (comprovante) ins.comprovante_url = comprovante;
      await sb.from('sitio_lancamentos').insert(ins);
      closeModal(); await loadSitio(); showToast('✅', 'Lançamento criado!', '');
    } }
  ], { onClose: () => { _sitioAttachFile = null; } });
}

export function sitioOpenEditLanc(id) {
  _sitioAttachFile = null;
  const { centros: _sitioCentros, lancamentos: _sitioLancs } = getState('sitio') || { centros: [], lancamentos: [] };
  const l = _sitioLancs.find(x => x.id === id);
  if (!l) return;
  const centroOpts = _sitioCentros.map(c => `<option value="${c.id}" ${l.centro_custo_id === c.id ? 'selected' : ''}>${c.icone || ''} ${esc(c.nome)}</option>`).join('');
  const dt = l.data_realizada || l.data_prevista || l.data_lancamento || '';
  openModal('Editar Lançamento', '', `
    <label class="m-label">Descrição</label><input class="m-input" id="m-sl-desc" value="${esc(l.descricao)}">
    <label class="m-label">Centro de custo</label>
    <select class="m-select" id="m-sl-centro"><option value="">Sem centro</option>${centroOpts}</select>
    <label class="m-label">Valor (R$)</label><input class="m-input" id="m-sl-valor" type="number" step="0.01" value="${l.valor || 0}">
    <label class="m-label">Tipo</label>
    <select class="m-select" id="m-sl-tipo"><option value="realizado" ${l.tipo === 'realizado' ? 'selected' : ''}>Realizado</option><option value="planejado" ${l.tipo === 'planejado' ? 'selected' : ''}>Planejado</option></select>
    <label class="m-label">Data</label><input class="m-input" id="m-sl-data" type="date" value="${dt}">
    <label class="m-label">Notas</label><textarea class="m-textarea" id="m-sl-notas" rows="2">${esc(l.notas || '')}</textarea>
    ${sitioAttachSection(l.comprovante_url ? 'has' : null)}
  `, [
    { label: 'Excluir', cls: 'btn-cancel', style: 'color:var(--red2)', action: async () => { if (confirm('Excluir lançamento?')) { await sb.from('sitio_lancamentos').delete().eq('id', id); closeModal(); await loadSitio(); showToast('🗑️', 'Lançamento excluido', ''); } } },
    { label: 'Salvar', cls: 'btn-confirm', action: async () => {
      const descricao = document.getElementById('m-sl-desc').value.trim();
      if (!descricao) return;
      const tipo = document.getElementById('m-sl-tipo').value;
      const dtv = document.getElementById('m-sl-data').value || null;
      const upd = { descricao, centro_custo_id: document.getElementById('m-sl-centro').value || null, valor: parseFloat(document.getElementById('m-sl-valor').value) || 0, tipo, data_realizada: tipo === 'realizado' ? dtv : null, data_prevista: tipo === 'planejado' ? dtv : null, data_lancamento: dtv, notas: document.getElementById('m-sl-notas').value.trim() || null };
      const newAttach = await sitioUploadAttach();
      if (newAttach) upd.comprovante_url = newAttach;
      if (document.getElementById('m-sl-remove-attach')?.value === '1') upd.comprovante_url = null;
      await sb.from('sitio_lancamentos').update(upd).eq('id', id);
      closeModal(); await loadSitio(); showToast('✅', 'Lançamento atualizado!', '');
    } }
  ], { onClose: () => { _sitioAttachFile = null; } });
  // Show existing comprovante with signed URL
  if (l.comprovante_url) {
    (async () => {
      const { data } = await sb.storage.from('documentos').createSignedUrl(l.comprovante_url, 300);
      if (data?.signedUrl) {
        const area = document.getElementById('m-sl-attach-area');
        if (!area) return; // Modal might have been closed
        const isPdf = l.comprovante_url.toLowerCase().endsWith('.pdf');
        area.innerHTML = `<div id="m-sl-attach-preview" style="display:flex;align-items:center;gap:8px;padding:8px;background:var(--bg);border-radius:var(--r-sm);border:1px solid var(--border)">
          ${isPdf ? '<span style="font-size:20px">📄</span>' : `<img src="${data.signedUrl}" style="max-height:60px;border-radius:4px">`}
          <a href="${data.signedUrl}" target="_blank" style="color:var(--teal);font-size:12px">📎 Ver comprovante</a>
          <span style="cursor:pointer;color:var(--red2);font-size:11px" onclick="document.getElementById('m-sl-attach-preview').remove();document.getElementById('m-sl-remove-attach').value='1'">✕ remover</span>
        </div>`;
      }
    })();
  }
}

export async function sitioDeleteLanc(id, nome) {
  if (!confirm('Excluir "' + nome + '"?')) return;
  await sb.from('sitio_lancamentos').delete().eq('id', id);
  await loadSitio(); showToast('🗑️', 'Lançamento excluido', '');
}

export async function sitioViewAttach(id) {
  const { lancamentos: _sitioLancs } = getState('sitio') || { lancamentos: [] };
  const l = _sitioLancs.find(x => x.id === id);
  if (!l?.comprovante_url) { showToast('⚠️', 'Sem comprovante', ''); return; }
  const { data, error } = await sb.storage.from('documentos').createSignedUrl(l.comprovante_url, 300);
  if (error || !data?.signedUrl) { showToast('❌', 'Erro ao abrir comprovante', ''); return; }
  window.open(data.signedUrl, '_blank');
}
