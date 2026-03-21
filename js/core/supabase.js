// ── Supabase Client + Data Helpers ──
// Depende do UMD supabase-js carregado via <script> no index.html

import { showToast } from './toast.js';

const SURL = 'https://msbwplsknncnxwsalumd.supabase.co';
const SKEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zYndwbHNrbm5jbnh3c2FsdW1kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NTUzMTAsImV4cCI6MjA4OTQzMTMxMH0.qDSAYC8KQO_PQsdRrwsIdYWdkrwqO2riFiDjJ08zctI';

export const sb = window.supabase.createClient(SURL, SKEY, {
  auth: { storage: window.localStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false }
});

/**
 * SELECT com error handling.
 * @param {string} table - Nome da tabela
 * @param {Object} opts
 * @param {string} [opts.select='*'] - Colunas
 * @param {Object} [opts.filters={}] - Filtros eq (chave:valor)
 * @param {Object} [opts.order] - { col, asc? }
 * @param {number} [opts.limit] - Limite de registros
 * @param {boolean} [opts.single=false] - Retorna objeto ao invés de array
 * @returns {Promise<Array|Object|null>}
 */
export async function query(table, { select = '*', filters = {}, order, limit, single = false } = {}) {
  try {
    let q = sb.from(table).select(select);
    for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
    if (order) q = q.order(order.col, { ascending: order.asc ?? true });
    if (limit) q = q.limit(limit);
    if (single) q = q.single();
    const { data, error } = await q;
    if (error) {
      showToast('⚠️', `Erro ao carregar ${table}`, error.message);
      return single ? null : [];
    }
    return data;
  } catch (e) {
    showToast('⚠️', 'Erro de conexão', e.message);
    return single ? null : [];
  }
}

/**
 * INSERT com error handling.
 * @returns {Promise<Object|null>} - Registro inserido ou null
 */
export async function insert(table, data) {
  try {
    const { data: result, error } = await sb.from(table).insert(data).select().single();
    if (error) {
      showToast('⚠️', `Erro ao salvar em ${table}`, error.message);
      return null;
    }
    return result;
  } catch (e) {
    showToast('⚠️', 'Erro de conexão', e.message);
    return null;
  }
}

/**
 * UPDATE com error handling.
 * @param {string} table
 * @param {Object} filters - Filtros eq para o WHERE
 * @param {Object} data - Campos a atualizar
 * @returns {Promise<Object|null>}
 */
export async function update(table, filters, data) {
  try {
    let q = sb.from(table).update(data);
    for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
    const { data: result, error } = await q.select().single();
    if (error) {
      showToast('⚠️', `Erro ao atualizar ${table}`, error.message);
      return null;
    }
    return result;
  } catch (e) {
    showToast('⚠️', 'Erro de conexão', e.message);
    return null;
  }
}

/**
 * DELETE com error handling.
 * @param {string} table
 * @param {Object} filters - Filtros eq para o WHERE
 * @returns {Promise<boolean>}
 */
export async function remove(table, filters) {
  try {
    let q = sb.from(table).delete();
    for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
    const { error } = await q;
    if (error) {
      showToast('⚠️', `Erro ao excluir de ${table}`, error.message);
      return false;
    }
    return true;
  } catch (e) {
    showToast('⚠️', 'Erro de conexão', e.message);
    return false;
  }
}

/**
 * UPSERT com error handling.
 * @param {string} table
 * @param {Object} data
 * @param {Object} [opts] - { onConflict: 'column_name' }
 * @returns {Promise<Object|null>}
 */
export async function upsert(table, data, opts = {}) {
  try {
    const { data: result, error } = await sb.from(table).upsert(data, opts).select().single();
    if (error) {
      showToast('⚠️', `Erro ao salvar em ${table}`, error.message);
      return null;
    }
    return result;
  } catch (e) {
    showToast('⚠️', 'Erro de conexão', e.message);
    return null;
  }
}

/**
 * Helper para pegar JWT token da sessão atual.
 * Usado nas chamadas às Edge Functions.
 */
export async function getToken() {
  const { data: { session } } = await sb.auth.getSession();
  return session?.access_token || '';
}
