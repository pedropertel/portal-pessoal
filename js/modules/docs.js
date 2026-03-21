// ── Documents — Files, Folders, Viewer, Upload, Share ──

import { sb } from '../core/supabase.js';
import { getState, setState } from '../core/store.js';
import { openModal, closeModal } from '../core/modal.js';
import { showToast } from '../core/toast.js';
import { esc, fmtDate } from '../core/utils.js';

const VIEWABLE_IMG = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'gif', 'bmp', 'svg'];
const VIEWABLE_PDF = ['pdf'];
let selectedItems = new Set();

export async function loadDocs() {
  const [{ data: folders }, { data: docs }] = await Promise.all([
    sb.from('pastas').select('*').order('nome'),
    sb.from('documentos').select('*').order('nome')
  ]);
  setState('docs', { folders: folders || [], files: docs || [], path: getState('docs')?.path || [] });
  renderDocs();
  document.getElementById('sc-docs').textContent = (docs || []).length;
}

export function renderDocs() {
  const { folders: allFolders, files: allDocs, path: docsPath } = getState('docs') || { folders: [], files: [], path: [] };

  // FIX: Validate docsPath - if current folder doesn't exist in allFolders, reset to root
  const validPath = [];
  for (const p of docsPath) {
    if (allFolders.some(f => f.id === p.id)) {
      validPath.push(p);
    } else {
      break; // Stop at first invalid path entry
    }
  }
  if (validPath.length !== docsPath.length) {
    setState('docs', { folders: allFolders, files: allDocs, path: validPath });
    // Don't return - continue rendering with valid path
  }

  const grid = document.getElementById('docs-grid');
  const currentId = validPath.length ? validPath[validPath.length - 1].id : null;
  renderDocsBreadcrumb(validPath);
  const subFolders = allFolders.filter(f => f.pasta_pai_id === currentId);
  const thisDocs = allDocs.filter(d => d.pasta_id === currentId);
  grid.innerHTML = '';
  if (!subFolders.length && !thisDocs.length) {
    grid.innerHTML = '<div class="doc-empty"><div class="doc-empty-ico">📂</div>Pasta vazia — crie uma subpasta ou faça upload de arquivos.</div>';
    return;
  }
  subFolders.forEach(f => {
    const el = document.createElement('div');
    el.className = 'doc-item';
    el.dataset.id = f.id; el.dataset.type = 'folder';
    el.innerHTML = `<div class="doc-item-ico">📁</div><div class="doc-item-name">${esc(f.nome)}</div><div class="doc-item-meta">${allFolders.filter(x => x.pasta_pai_id === f.id).length} subpastas · ${allDocs.filter(d => d.pasta_id === f.id).length} arquivos</div><div class="doc-item-menu" data-id="${f.id}" data-type="folder" data-nome="${esc(f.nome)}">⋯</div>`;
    el.addEventListener('dblclick', () => enterFolder(f));
    el.addEventListener('click', e => { if (!e.target.classList.contains('doc-item-menu')) toggleSelect(el, f.id); });
    el.querySelector('.doc-item-menu').addEventListener('click', e => { e.stopPropagation(); showCtxMenu(e, f.id, 'folder', f.nome); });
    grid.appendChild(el);
  });
  thisDocs.forEach(d => {
    const el = document.createElement('div');
    el.className = 'doc-item';
    el.dataset.id = d.id; el.dataset.type = 'doc';
    const ext = d.arquivo_nome?.split('.').pop()?.toLowerCase() || '';
    const ico = ext === 'pdf' ? '📄' : ext === 'jpg' || ext === 'png' ? '🖼️' : ext === 'xlsx' || ext === 'csv' ? '📊' : '📎';
    el.innerHTML = `<div class="doc-item-ico">${ico}</div><div class="doc-item-name">${esc(d.nome || d.arquivo_nome || 'Arquivo')}</div><div class="doc-item-meta">${d.criado_em ? fmtDate(d.criado_em) : ''}</div><div class="doc-item-menu" data-id="${d.id}" data-type="doc">⋯</div>`;
    el.addEventListener('click', e => { if (!e.target.classList.contains('doc-item-menu')) openFileViewer(d.id); });
    el.querySelector('.doc-item-menu').addEventListener('click', e => { e.stopPropagation(); showCtxMenu(e, d.id, 'doc', d.nome); });
    grid.appendChild(el);
  });
}

function renderDocsBreadcrumb(docsPath) {
  const nav = document.getElementById('docs-breadcrumb');
  nav.innerHTML = '<span class="bc-item" onclick="goRoot()">🏠 Início</span>';
  docsPath.forEach((p, i) => {
    nav.innerHTML += `<span class="bc-sep"> / </span>`;
    if (i === docsPath.length - 1) nav.innerHTML += `<span class="bc-current">${esc(p.nome)}</span>`;
    else nav.innerHTML += `<span class="bc-item" onclick="goToPathIndex(${i})">${esc(p.nome)}</span>`;
  });
}

function enterFolder(f) {
  const docs = getState('docs');
  setState('docs', { ...docs, path: [...docs.path, { id: f.id, nome: f.nome }] });
  renderDocs();
}

export function goRoot() {
  const docs = getState('docs');
  setState('docs', { ...docs, path: [] });
  renderDocs();
}

export function goToPathIndex(i) {
  const docs = getState('docs');
  setState('docs', { ...docs, path: docs.path.slice(0, i + 1) });
  renderDocs();
}

function toggleSelect(el, id) {
  if (el.classList.contains('selected')) { el.classList.remove('selected'); selectedItems.delete(id); }
  else { el.classList.add('selected'); selectedItems.add(id); }
}

function showCtxMenu(e, id, type, nome = '') {
  const { folders: allFolders, files: allDocs, path: docsPath } = getState('docs');
  document.querySelectorAll('.ctx-menu').forEach(x => x.remove());
  const menu = document.createElement('div');
  menu.className = 'ctx-menu';
  if (type === 'folder') {
    menu.innerHTML = `
      <div class="ctx-item" id="cm-open">📂 Abrir</div>
      <div class="ctx-item" id="cm-rename">✏️ Renomear</div>
      ${docsPath.length < 3 ? '<div class="ctx-item" id="cm-subfolder">📁 Nova subpasta</div>' : ''}
      <div class="ctx-sep"></div>
      <div class="ctx-item danger" id="cm-del">🗑️ Excluir</div>`;
    menu.style.left = e.pageX + 'px'; menu.style.top = e.pageY + 'px';
    document.body.appendChild(menu);
    const folder = allFolders.find(f => f.id === id);
    menu.querySelector('#cm-open').onclick = () => { if (folder) enterFolder(folder); menu.remove(); };
    menu.querySelector('#cm-rename').onclick = () => { menu.remove(); renameFolder(id, nome); };
    if (menu.querySelector('#cm-subfolder')) menu.querySelector('#cm-subfolder').onclick = () => { menu.remove(); openNewFolder(id); };
    menu.querySelector('#cm-del').onclick = () => { menu.remove(); deleteFolder(id, nome); };
  } else {
    menu.innerHTML = `<div class="ctx-item" id="cm-view">👁️ Visualizar</div><div class="ctx-item" id="cm-download">⬇️ Download</div><div class="ctx-item" id="cm-share">🔗 Compartilhar</div><div class="ctx-item" id="cm-rename">✏️ Renomear</div><div class="ctx-sep"></div><div class="ctx-item danger" id="cm-del">🗑️ Excluir</div>`;
    menu.style.left = e.pageX + 'px'; menu.style.top = e.pageY + 'px';
    document.body.appendChild(menu);
    menu.querySelector('#cm-view').onclick = () => { menu.remove(); openFileViewer(id); };
    menu.querySelector('#cm-download').onclick = () => { menu.remove(); downloadDoc(id); };
    menu.querySelector('#cm-share').onclick = () => { menu.remove(); shareDoc(id); };
    menu.querySelector('#cm-rename').onclick = () => { menu.remove(); renameDoc(id, nome); };
    menu.querySelector('#cm-del').onclick = () => { menu.remove(); deleteDoc(id, nome); };
  }
  setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 100);
}

export function openNewFolder(parentId = null) {
  if (parentId === null) {
    const docs = getState('docs');
    parentId = docs.path.length ? docs.path[docs.path.length - 1].id : null;
  }
  openModal('Nova Pasta', '', `<label class="m-label">Nome da pasta</label><input class="m-input" id="m-fname" placeholder="Ex: Contratos 2026" autofocus>`, [
    { label: 'Cancelar', cls: 'btn-cancel', action: closeModal },
    { label: 'Criar', cls: 'btn-confirm', action: async () => {
      const nome = document.getElementById('m-fname').value.trim();
      if (!nome) return;
      await sb.from('pastas').insert({ nome, pasta_pai_id: parentId });
      closeModal(); await loadDocs(); showToast('📁', 'Pasta criada!', '');
    } }
  ]);
  setTimeout(() => document.getElementById('m-fname')?.focus(), 100);
}

function renameFolder(id, currentName) {
  openModal('Renomear Pasta', '', `<label class="m-label">Novo nome</label><input class="m-input" id="m-fname" value="${esc(currentName)}">`, [
    { label: 'Cancelar', cls: 'btn-cancel', action: closeModal },
    { label: 'Salvar', cls: 'btn-confirm', action: async () => {
      const nome = document.getElementById('m-fname').value.trim();
      if (!nome) return;
      await sb.from('pastas').update({ nome }).eq('id', id);
      const docs = getState('docs');
      setState('docs', { ...docs, path: docs.path.map(p => p.id === id ? { ...p, nome } : p) });
      closeModal(); await loadDocs(); showToast('✏️', 'Pasta renomeada!', '');
    } }
  ]);
  setTimeout(() => { const el = document.getElementById('m-fname'); if (el) { el.focus(); el.select(); } }, 100);
}

async function deleteFolder(id, nome) {
  const { folders: allFolders, files: allDocs } = getState('docs');
  const hasChildren = allFolders.some(f => f.pasta_pai_id === id) || allDocs.some(d => d.pasta_id === id);
  if (hasChildren) { openModal('Pasta não vazia', `A pasta "${nome}" ainda tem conteúdo. Esvazie-a antes de excluir.`, '', [{ label: 'OK', cls: 'btn-confirm', action: closeModal }]); return; }
  if (!confirm(`Excluir a pasta "${nome}"?`)) return;
  await sb.from('pastas').delete().eq('id', id);
  const docs = getState('docs');
  setState('docs', { ...docs, path: docs.path.filter(p => p.id !== id) });
  await loadDocs(); showToast('🗑️', 'Pasta excluída', '');
}

function renameDoc(id, currentName) {
  openModal('Renomear Arquivo', '', `<label class="m-label">Novo nome</label><input class="m-input" id="m-dname" value="${esc(currentName)}">`, [
    { label: 'Cancelar', cls: 'btn-cancel', action: closeModal },
    { label: 'Salvar', cls: 'btn-confirm', action: async () => {
      const nome = document.getElementById('m-dname').value.trim();
      if (!nome) return;
      await sb.from('documentos').update({ nome }).eq('id', id);
      closeModal(); await loadDocs(); showToast('✏️', 'Arquivo renomeado!', '');
    } }
  ]);
  setTimeout(() => { const el = document.getElementById('m-dname'); if (el) { el.focus(); el.select(); } }, 100);
}

async function downloadDoc(id) {
  const allDocs = getState('docs')?.files || [];
  const doc = allDocs.find(d => d.id === id);
  if (!doc?.arquivo_url) { showToast('⚠️', 'Arquivo sem URL de download', ''); return; }
  const { data, error } = await sb.storage.from('documentos').createSignedUrl(doc.arquivo_url, 60);
  if (error || !data?.signedUrl) { showToast('❌', 'Erro ao gerar link', ''); return; }
  const a = document.createElement('a');
  a.href = data.signedUrl;
  a.download = doc.arquivo_nome || doc.nome;
  a.click();
}

export async function openFileViewer(id) {
  const allDocs = getState('docs')?.files || [];
  const doc = allDocs.find(d => d.id === id);
  if (!doc?.arquivo_url) { showToast('⚠️', 'Arquivo sem URL', ''); return; }
  const ext = (doc.arquivo_nome || doc.nome || '').split('.').pop()?.toLowerCase() || '';
  const isImg = VIEWABLE_IMG.includes(ext);
  const isPdf = VIEWABLE_PDF.includes(ext);
  if (!isImg && !isPdf) { downloadDoc(id); return; }
  const { data, error } = await sb.storage.from('documentos').createSignedUrl(doc.arquivo_url, 3600);
  if (error || !data?.signedUrl) { showToast('❌', 'Erro ao abrir arquivo', ''); return; }
  const url = data.signedUrl;
  const viewer = document.getElementById('file-viewer');
  document.getElementById('fv-name').textContent = doc.nome || doc.arquivo_nome || 'Arquivo';
  const body = document.getElementById('fv-body');
  if (isPdf) {
    body.innerHTML = `<iframe src="${url}#toolbar=0" style="width:100%;height:100%;border:none"></iframe>`;
  } else {
    body.innerHTML = `<img src="${url}" alt="${esc(doc.nome || '')}" style="touch-action:pinch-zoom">`;
  }
  document.getElementById('fv-download').onclick = () => {
    const a = document.createElement('a'); a.href = url; a.download = doc.arquivo_nome || doc.nome; a.click();
  };
  document.getElementById('fv-share').onclick = () => shareDoc(id);
  viewer.classList.add('open');
}

export function closeFileViewer() {
  const viewer = document.getElementById('file-viewer');
  viewer.classList.remove('open');
  document.getElementById('fv-body').innerHTML = '';
}

async function shareDoc(id) {
  const allDocs = getState('docs')?.files || [];
  const doc = allDocs.find(d => d.id === id);
  if (!doc?.arquivo_url) { showToast('⚠️', 'Arquivo sem URL', ''); return; }
  const { data, error } = await sb.storage.from('documentos').createSignedUrl(doc.arquivo_url, 604800);
  if (error || !data?.signedUrl) { showToast('❌', 'Erro ao gerar link', ''); return; }
  const nome = doc.arquivo_nome || doc.nome || 'arquivo';
  try {
    const res = await fetch(data.signedUrl);
    const blob = await res.blob();
    const file = new File([blob], nome, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: nome });
      return;
    }
  } catch (e) {
    if (e.name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(data.signedUrl);
    showToast('🔗', 'Link copiado!', 'Válido por 7 dias');
  } catch (e) {
    prompt('Copie o link:', data.signedUrl);
  }
}

async function deleteDoc(id, nome) {
  if (!confirm(`Excluir "${nome}"?`)) return;
  await sb.from('documentos').delete().eq('id', id);
  await loadDocs(); showToast('🗑️', 'Arquivo excluído', '');
}

export function triggerUpload() {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.accept = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip,.mp4,.mov,.mp3,.wav';
  input.onchange = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    const docs = getState('docs');
    const currentPastaId = docs.path.length ? docs.path[docs.path.length - 1].id : null;
    let ok = 0, fail = 0;
    showToast('⬆️', `Enviando ${files.length} arquivo(s)...`, '');
    for (const file of files) {
      try {
        const { data: { session } } = await sb.auth.getSession();
        const uid = session?.user?.id || 'user';
        const path = `${uid}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const { data, error } = await sb.storage.from('documentos').upload(path, file, { upsert: false });
        if (error) throw error;
        await sb.from('documentos').insert({
          nome: file.name,
          pasta_id: currentPastaId,
          arquivo_url: data.path,
          arquivo_nome: file.name,
          arquivo_tipo: file.type,
          arquivo_tamanho: file.size,
        });
        ok++;
      } catch (err) {
        console.error(err);
        fail++;
      }
    }
    await loadDocs();
    if (ok > 0) showToast('✅', `${ok} arquivo(s) enviado(s)!`, fail > 0 ? `${fail} com erro` : '');
    else showToast('❌', 'Erro no upload', 'Tente novamente');
  };
  input.click();
}

// Setup buttons
export function setupDocButtons() {
  const btnFolder = document.getElementById('btn-new-folder');
  const btnUpload = document.getElementById('btn-upload');
  if (btnFolder) btnFolder.onclick = () => openNewFolder(null);
  if (btnUpload) btnUpload.onclick = () => triggerUpload();
}
