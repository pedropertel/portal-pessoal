// ── Toast — Notificações temporárias ──

import { esc } from './utils.js';

/**
 * Mostra uma notificação toast temporária (4 segundos).
 * @param {string} ico - Ícone/emoji
 * @param {string} ttl - Título
 * @param {string} [msg=''] - Mensagem opcional
 */
export function showToast(ico, ttl, msg = '') {
  const container = document.getElementById('toasts');
  if (!container) return;

  const el = document.createElement('div');
  el.className = 'toast-item';
  el.innerHTML = `<div class="toast-ico">${ico}</div><div class="toast-body"><div class="toast-ttl">${esc(ttl)}</div>${msg ? `<div class="toast-msg">${esc(msg)}</div>` : ''}</div><div class="toast-close" style="cursor:pointer">✕</div>`;

  el.querySelector('.toast-close').onclick = () => el.remove();
  container.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}
