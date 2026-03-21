// ── Modal Manager — Stack-based para evitar colisões ──
// Cada openModal() cria um overlay novo. closeModal() remove o do topo.

import { esc } from './utils.js';

/** @type {HTMLElement[]} */
const modalStack = [];

/**
 * Abre um modal. Cria um overlay novo no DOM (não reutiliza o #overlay do HTML).
 * Múltiplos modais podem coexistir em stack.
 *
 * @param {string} ttl - Título
 * @param {string} sub - Subtítulo
 * @param {string} content - HTML do conteúdo
 * @param {Array<{label: string, cls?: string, style?: string, action: Function}>} actions - Botões
 * @param {Object} [opts] - Opções extras
 * @param {Function} [opts.onClose] - Callback ao fechar (ex: limpar estado temporário)
 */
export function openModal(ttl, sub, content, actions = [], opts = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay open';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:' + (800 + modalStack.length) + ';display:flex;align-items:center;justify-content:center;padding:20px;';

  overlay.innerHTML = `
    <div class="modal" style="background:var(--card);border:1px solid var(--border);border-radius:16px;width:100%;max-width:440px;padding:24px;">
      <div class="modal-ttl" style="font-size:18px;font-weight:700;color:var(--white);margin-bottom:4px;">${esc(ttl)}</div>
      <div class="modal-sub" style="font-size:13px;color:var(--text2);margin-bottom:20px;">${esc(sub)}</div>
      <div class="modal-content-inner">${content}</div>
      <div class="modal-actions-inner" style="display:flex;gap:8px;margin-top:20px;justify-content:flex-end;"></div>
    </div>
  `;

  // Botões de ação
  const actsEl = overlay.querySelector('.modal-actions-inner');
  actions.forEach(a => {
    const btn = document.createElement('button');
    btn.className = a.cls || '';
    btn.textContent = a.label;
    if (a.style) btn.style.cssText = a.style;
    btn.onclick = a.action;
    actsEl.appendChild(btn);
  });

  // Fechar ao clicar no overlay (fora do modal)
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeModal();
  });

  // ESC fecha o modal do topo
  overlay._onKeydown = e => {
    if (e.key === 'Escape') closeModal();
  };
  document.addEventListener('keydown', overlay._onKeydown);

  // Guardar callback de close
  overlay._onClose = opts.onClose || null;

  document.body.appendChild(overlay);
  modalStack.push(overlay);
}

/**
 * Fecha o modal do topo da stack.
 */
export function closeModal() {
  const overlay = modalStack.pop();
  if (!overlay) return;

  // Remover listener de ESC
  if (overlay._onKeydown) {
    document.removeEventListener('keydown', overlay._onKeydown);
  }

  // Callback de cleanup
  if (overlay._onClose) {
    try { overlay._onClose(); } catch (e) { console.error('[Modal] Erro no onClose:', e); }
  }

  overlay.remove();
}

/**
 * Verifica se há algum modal aberto.
 */
export function hasOpenModal() {
  return modalStack.length > 0;
}
