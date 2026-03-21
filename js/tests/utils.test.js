import { describe, it, assert, assertEqual } from './runner.js';
import { esc, fmtDate, fmtMoney, parseDateBR } from '../core/utils.js';

// ── esc() ──

describe('esc() — HTML escaping', () => {
  it('escapa < e >', () => {
    assertEqual(esc('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });

  it('escapa &', () => {
    assertEqual(esc('A & B'), 'A &amp; B');
  });

  it('escapa aspas duplas', () => {
    assertEqual(esc('valor="teste"'), 'valor=&quot;teste&quot;');
  });

  it('retorna string vazia para null/undefined', () => {
    assertEqual(esc(null), '');
    assertEqual(esc(undefined), '');
    assertEqual(esc(''), '');
  });

  it('converte número para string', () => {
    assertEqual(esc(42), '42');
  });

  it('não altera texto sem caracteres especiais', () => {
    assertEqual(esc('texto normal'), 'texto normal');
  });
});

// ── fmtDate() ──

describe('fmtDate() — formatação de data ISO para pt-BR', () => {
  it('formata data ISO corretamente', () => {
    const result = fmtDate('2026-03-20');
    assert(result.includes('20'), `Esperava conter "20", got "${result}"`);
    assert(result.includes('03'), `Esperava conter "03", got "${result}"`);
  });

  it('retorna input original se inválido', () => {
    assertEqual(fmtDate('invalido'), 'invalido');
  });

  it('lida com data e hora', () => {
    const result = fmtDate('2026-01-15T10:30:00');
    assert(result.includes('15'), `Esperava conter "15", got "${result}"`);
    assert(result.includes('01'), `Esperava conter "01", got "${result}"`);
  });
});

// ── fmtMoney() ──

describe('fmtMoney() — formatação monetária R$', () => {
  it('formata valor inteiro', () => {
    const result = fmtMoney(1500);
    assert(result.startsWith('R$ '), `Esperava começar com "R$ ", got "${result}"`);
    assert(result.includes('1.500') || result.includes('1500'), `Esperava conter "1.500", got "${result}"`);
  });

  it('formata zero', () => {
    assertEqual(fmtMoney(0), 'R$ 0');
  });

  it('trata null/undefined como zero', () => {
    assertEqual(fmtMoney(null), 'R$ 0');
    assertEqual(fmtMoney(undefined), 'R$ 0');
  });

  it('formata valor grande', () => {
    const result = fmtMoney(1000000);
    assert(result.includes('1.000.000') || result.includes('1000000'), `Esperava conter "1.000.000", got "${result}"`);
  });

  it('formata valor decimal (trunca centavos)', () => {
    const result = fmtMoney(99.99);
    assert(result.startsWith('R$ '), `Esperava começar com "R$ ", got "${result}"`);
  });
});

// ── parseDateBR() ──

describe('parseDateBR() — conversão DD/MM/AAAA para ISO', () => {
  it('converte DD/MM/AAAA', () => {
    assertEqual(parseDateBR('20/03/2026'), '2026-03-20');
  });

  it('converte D/M/AAAA (sem zero à esquerda)', () => {
    assertEqual(parseDateBR('5/1/2026'), '2026-01-05');
  });

  it('converte DD-MM-AAAA (separador traço)', () => {
    assertEqual(parseDateBR('15-06-2025'), '2025-06-15');
  });

  it('converte DD.MM.AAAA (separador ponto)', () => {
    assertEqual(parseDateBR('01.12.2024'), '2024-12-01');
  });

  it('converte DD/MM/AA (ano curto ≤ 50 → 20XX)', () => {
    assertEqual(parseDateBR('10/05/26'), '2026-05-10');
  });

  it('converte DD/MM/AA (ano curto > 50 → 19XX)', () => {
    assertEqual(parseDateBR('10/05/85'), '1985-05-10');
  });

  it('retorna ISO se já está no formato ISO', () => {
    assertEqual(parseDateBR('2026-03-20'), '2026-03-20');
  });

  it('retorna ISO truncado se tem timestamp', () => {
    assertEqual(parseDateBR('2026-03-20T10:30:00'), '2026-03-20');
  });

  it('retorna null para null/undefined/vazio', () => {
    assertEqual(parseDateBR(null), null);
    assertEqual(parseDateBR(undefined), null);
    assertEqual(parseDateBR(''), null);
  });

  it('retorna null para formato inválido', () => {
    assertEqual(parseDateBR('abc'), null);
    assertEqual(parseDateBR('2026'), null);
    assertEqual(parseDateBR('03/2026'), null);
  });

  it('lida com espaços ao redor', () => {
    assertEqual(parseDateBR('  20/03/2026  '), '2026-03-20');
  });
});
