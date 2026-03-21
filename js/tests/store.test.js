import { describe, it, assert, assertEqual } from './runner.js';
import { getState, setState, subscribe, getSnapshot } from '../core/store.js';

// ── getState / setState ──

describe('Store — getState / setState', () => {
  it('retorna array vazio para tasks inicialmente', () => {
    const tasks = getState('tasks');
    assert(Array.isArray(tasks), 'tasks deveria ser um array');
    assertEqual(tasks.length, 0);
  });

  it('setState substitui arrays', () => {
    setState('tasks', [{ id: 1, titulo: 'Teste' }]);
    const tasks = getState('tasks');
    assertEqual(tasks.length, 1);
    assertEqual(tasks[0].titulo, 'Teste');
    // Cleanup
    setState('tasks', []);
  });

  it('setState faz shallow merge em objetos', () => {
    setState('ui', { currentPage: 'chat' });
    const ui = getState('ui');
    assertEqual(ui.currentPage, 'chat');
    // sidebarOpen deve persistir do estado inicial
    assert(ui.sidebarOpen !== undefined, 'sidebarOpen deveria existir após merge');
    // Cleanup
    setState('ui', { currentPage: 'dashboard' });
  });

  it('setState substitui primitivos', () => {
    setState('entidades', [{ id: 'a', nome: 'CEDTEC' }]);
    assertEqual(getState('entidades').length, 1);
    setState('entidades', []);
  });
});

// ── subscribe ──

describe('Store — subscribe / notify', () => {
  it('listener é chamado ao mudar estado', () => {
    let called = false;
    let newVal = null;
    const unsub = subscribe('tasks', (val) => { called = true; newVal = val; });

    setState('tasks', [{ id: 99 }]);
    assert(called, 'Listener deveria ter sido chamado');
    assertEqual(newVal.length, 1);
    assertEqual(newVal[0].id, 99);

    unsub();
    setState('tasks', []);
  });

  it('unsubscribe para de notificar', () => {
    let count = 0;
    const unsub = subscribe('tasks', () => count++);

    setState('tasks', [1]);
    assertEqual(count, 1);

    unsub();
    setState('tasks', [2]);
    assertEqual(count, 1, 'Não deveria ter sido chamado após unsubscribe');

    setState('tasks', []);
  });

  it('listener de uma chave não é chamado ao mudar outra', () => {
    let called = false;
    const unsub = subscribe('events', () => { called = true; });

    setState('tasks', [{ id: 1 }]);
    assert(!called, 'Listener de events não deveria ser chamado ao mudar tasks');

    unsub();
    setState('tasks', []);
  });

  it('múltiplos listeners na mesma chave', () => {
    let count1 = 0, count2 = 0;
    const unsub1 = subscribe('entidades', () => count1++);
    const unsub2 = subscribe('entidades', () => count2++);

    setState('entidades', [{ id: 1 }]);
    assertEqual(count1, 1);
    assertEqual(count2, 1);

    unsub1();
    unsub2();
    setState('entidades', []);
  });

  it('erro em listener não quebra outros listeners', () => {
    let secondCalled = false;
    const unsub1 = subscribe('tasks', () => { throw new Error('Falha intencional'); });
    const unsub2 = subscribe('tasks', () => { secondCalled = true; });

    setState('tasks', [1]);
    assert(secondCalled, 'Segundo listener deveria executar mesmo com erro no primeiro');

    unsub1();
    unsub2();
    setState('tasks', []);
  });
});

// ── getSnapshot ──

describe('Store — getSnapshot', () => {
  it('retorna cópia do estado', () => {
    const snap = getSnapshot();
    assert(snap.tasks !== undefined, 'Snapshot deveria ter tasks');
    assert(snap.ui !== undefined, 'Snapshot deveria ter ui');
    assert(snap.entidades !== undefined, 'Snapshot deveria ter entidades');
  });
});
