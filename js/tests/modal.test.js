import { describe, it, assert, assertEqual } from './runner.js';
import { openModal, closeModal, hasOpenModal } from '../core/modal.js';

describe('Modal — stack push/pop', () => {
  it('inicialmente sem modal aberto', () => {
    assert(!hasOpenModal(), 'Não deveria ter modal aberto');
  });

  it('openModal cria overlay no DOM', () => {
    openModal('Teste', 'Sub', '<p>Conteúdo</p>', []);
    assert(hasOpenModal(), 'Deveria ter modal aberto');

    const overlays = document.querySelectorAll('.modal-overlay');
    assert(overlays.length >= 1, 'Deveria existir ao menos 1 overlay no DOM');

    closeModal();
  });

  it('closeModal remove overlay do DOM', () => {
    openModal('Teste', 'Sub', '<p>Conteúdo</p>', []);
    closeModal();
    assert(!hasOpenModal(), 'Não deveria ter modal aberto após close');
  });

  it('stack: múltiplos modais coexistem', () => {
    openModal('Modal 1', 'Sub 1', '<p>1</p>', []);
    openModal('Modal 2', 'Sub 2', '<p>2</p>', []);

    const overlays = document.querySelectorAll('.modal-overlay');
    assert(overlays.length >= 2, `Deveria ter 2+ overlays, tem ${overlays.length}`);

    // Fecha o do topo (Modal 2)
    closeModal();
    assert(hasOpenModal(), 'Ainda deveria ter Modal 1 aberto');

    // Fecha Modal 1
    closeModal();
    assert(!hasOpenModal(), 'Nenhum modal deveria estar aberto');
  });

  it('closeModal sem modal aberto não dá erro', () => {
    closeModal(); // Não deve lançar exceção
    assert(true, 'closeModal sem stack não quebra');
  });

  it('onClose callback é chamado ao fechar', () => {
    let closeCalled = false;
    openModal('Teste', 'Sub', '<p>Conteúdo</p>', [], { onClose: () => { closeCalled = true; } });
    closeModal();
    assert(closeCalled, 'onClose deveria ter sido chamado');
  });

  it('botões de ação são renderizados', () => {
    let clicked = false;
    openModal('Teste', 'Sub', '<p>Conteúdo</p>', [
      { label: 'Salvar', cls: 'btn-primary', action: () => { clicked = true; } }
    ]);

    const overlay = document.querySelector('.modal-overlay');
    const btn = overlay.querySelector('.modal-actions-inner button');
    assert(btn, 'Botão deveria existir');
    assertEqual(btn.textContent, 'Salvar');

    btn.click();
    assert(clicked, 'Ação do botão deveria ter sido executada');

    closeModal();
  });

  it('conteúdo HTML é renderizado dentro do modal', () => {
    openModal('Teste', 'Sub', '<input id="test-input-xyz" value="hello">', []);

    const input = document.getElementById('test-input-xyz');
    assert(input, 'Input deveria existir no DOM');
    assertEqual(input.value, 'hello');

    closeModal();
  });
});
