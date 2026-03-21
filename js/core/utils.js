// ── Utils — Funções puras reutilizáveis ──

/**
 * Escapa HTML para evitar XSS
 */
export function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Formata data ISO para DD/MM/AA (pt-BR)
 */
export function fmtDate(s) {
  try {
    return new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  } catch (e) {
    return s;
  }
}

/**
 * Formata valor numérico como R$ (sem centavos)
 */
export function fmtMoney(v) {
  return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/**
 * Converte data no formato brasileiro (DD/MM/AAAA ou DD/MM/AA) para ISO (YYYY-MM-DD)
 * Aceita separadores: / - .
 * Retorna null se não conseguir parsear
 */
export function parseDateBR(str) {
  if (!str) return null;
  str = String(str).trim();
  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  // DD/MM/AAAA or DD/MM/AA
  const m = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (!m) return null;
  const day = m[1].padStart(2, '0');
  const month = m[2].padStart(2, '0');
  let year = m[3];
  if (year.length === 2) year = (parseInt(year) > 50 ? '19' : '20') + year;
  return `${year}-${month}-${day}`;
}
