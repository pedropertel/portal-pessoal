// ── Router — Navegação entre páginas ──

import { setState } from './store.js';

/** @type {Map<string, Function>} */
const pageLoaders = new Map();

/**
 * Registra uma página com seu loader.
 * Chamado por cada módulo durante a inicialização.
 * @param {string} name - Nome da página (ex: 'tasks', 'dashboard')
 * @param {Function} loader - Função async para carregar/renderizar a página
 */
export function registerPage(name, loader) {
  pageLoaders.set(name, loader);
}

/**
 * Navega para uma página.
 * Desativa todas as pages/nav-items, ativa a selecionada, e chama o loader.
 * @param {string} name - Nome da página
 */
export function goPage(name) {
  // Desativar tudo
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  // Ativar página e nav
  const page = document.getElementById('page-' + name);
  const nav = document.querySelector(`.nav-item[data-page="${name}"]`);
  if (page) page.classList.add('active');
  if (nav) nav.classList.add('active');

  // Atualizar estado
  setState('ui', { currentPage: name });

  // Fechar notificação push se aberta
  const notif = document.getElementById('push-notif');
  if (notif) notif.classList.remove('show');

  // Chamar loader da página
  const loader = pageLoaders.get(name);
  if (loader) {
    try { loader(); } catch (e) { console.error(`[Router] Erro ao carregar "${name}":`, e); }
  }
}

/**
 * Retorna a página atual.
 */
export function getCurrentPage() {
  return [...document.querySelectorAll('.page.active')]
    .map(p => p.id.replace('page-', ''))[0] || 'dashboard';
}
