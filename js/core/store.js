// ── Store — Estado centralizado com pub/sub ──
// Substitui as ~35 variáveis globais por estado isolado por domínio

const state = {
  entidades: [],
  tasks: [],
  events: [],
  docs: { folders: [], files: [], path: [] },
  chat: { history: [], sending: false },
  marcos: { history: [], sending: false },
  sitio: { centros: [], lancamentos: [] },
  cedtec: { meta: null, recargas: [], campanhas: [], sge: [], metaCamp: [], conexao: null },
  ui: { currentPage: 'dashboard', sidebarOpen: true, appInitialized: false }
};

/** @type {Map<string, Set<Function>>} */
const listeners = new Map();

/**
 * Retorna o estado atual de uma chave.
 * @param {string} key - Chave do domínio (ex: 'tasks', 'docs', 'ui')
 * @returns {*} Valor atual
 */
export function getState(key) {
  return state[key];
}

/**
 * Atualiza o estado de uma chave e notifica listeners.
 * Para objetos, faz shallow merge. Para arrays/primitivos, substitui.
 * @param {string} key
 * @param {*} value
 */
export function setState(key, value) {
  const prev = state[key];

  // Shallow merge para objetos (não-arrays)
  if (value && typeof value === 'object' && !Array.isArray(value) && typeof prev === 'object' && !Array.isArray(prev)) {
    state[key] = { ...prev, ...value };
  } else {
    state[key] = value;
  }

  // Notifica listeners
  const subs = listeners.get(key);
  if (subs) {
    for (const cb of subs) {
      try { cb(state[key], prev); } catch (e) { console.error(`[Store] Erro no listener de "${key}":`, e); }
    }
  }
}

/**
 * Inscreve um callback para mudanças em uma chave.
 * @param {string} key
 * @param {Function} callback - (newValue, prevValue) => void
 * @returns {Function} Função para cancelar a inscrição
 */
export function subscribe(key, callback) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(callback);

  // Retorna unsubscribe
  return () => listeners.get(key).delete(callback);
}

/**
 * Retorna snapshot completo do estado (somente leitura, para debug).
 */
export function getSnapshot() {
  return { ...state };
}
