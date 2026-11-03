import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { filaDaEstacao, linhasDaMesa } from '../src/dominio/salao.ts';
import { linha, novoId, salaoDeTeste } from './apoio.ts';

describe('mesa e pedido', () => {
  it('abre a mesa e manda cada item para a sua estação', () => {
    const { livro, executar } = salaoDeTeste();
    assert.equal(executar({ tipo: 'abrir-mesa', mesa: 4, pessoas: 3, garcom: 'Rita' }).ok, true);
    const pedido = executar({ tipo: 'pedir', mesa: 4, pedidoId: novoId('ped'), linhas: [linha('abara', { qtd: 2 }), linha('caipirinha'), linha('suco-caja')] });
    assert.equal(pedido.ok, true);
    assert.deepEqual(filaDaEstacao(livro.salao, 'cozinha').tickets.map((t) => t.linhas.map((l) => `${l.qtd} ${l.nome}`)), [['2 Abará']]);
    assert.deepEqual(filaDaEstacao(livro.salao, 'bar').tickets[0].linhas.map((l) => l.nome), ['Caipirinha de umbu', 'Suco de cajá']);
  });

  it('recusa o que não faz sentido, dizendo o porquê', () => {
    const { executar } = salaoDeTeste();
    assert.deepEqual(executar({ tipo: 'pedir', mesa: 9, pedidoId: novoId('ped'), linhas: [linha('abara')] }), { ok: false, erro: 'A mesa 9 não está aberta.', repetido: false });
    executar({ tipo: 'abrir-mesa', mesa: 9, pessoas: 2, garcom: 'Rita' });
    assert.equal(executar({ tipo: 'abrir-mesa', mesa: 9, pessoas: 2, garcom: 'Rita' }).ok, false);
    assert.match(String((executar({ tipo: 'pedir', mesa: 9, pedidoId: novoId('ped'), linhas: [linha('pizza')] }) as { erro: string }).erro), /fora do cardápio/);
    assert.match(String((executar({ tipo: 'pedir', mesa: 9, pedidoId: novoId('ped'), linhas: [linha('abara', { pessoa: 3 })] }) as { erro: string }).erro), /tem 2 pessoas/);
    assert.match(String((executar({ tipo: 'abrir-mesa', mesa: 21, pessoas: 2, garcom: 'Rita' }) as { erro: string }).erro), /Mesa de 1 a 20/);
  });

  it('segura o principal até o garçom chamar, e a cozinha vê o que vem pela frente', () => {
    const { livro, executar } = salaoDeTeste();
    executar({ tipo: 'abrir-mesa', mesa: 2, pessoas: 2, garcom: 'Rita' });
    executar({ tipo: 'pedir', mesa: 2, pedidoId: novoId('ped'), linhas: [linha('casquinha'), linha('moqueca-mista', { segurar: true }), linha('agua-coco', { segurar: true })] });
    let fila = filaDaEstacao(livro.salao, 'cozinha');
    assert.deepEqual(fila.tickets.flatMap((t) => t.linhas.map((l) => l.nome)), ['Casquinha de siri']);
    assert.deepEqual(fila.seguradas.map((l) => l.nome), ['Moqueca mista']);
    // Bebida nunca espera
    assert.equal(filaDaEstacao(livro.salao, 'bar').tickets.length, 1);

    assert.equal(executar({ tipo: 'chamar-etapa', mesa: 2, etapa: 'principal' }).ok, true);
    fila = filaDaEstacao(livro.salao, 'cozinha');
    assert.equal(fila.seguradas.length, 0);
    assert.deepEqual(fila.tickets.map((t) => t.linhas.map((l) => l.nome)), [['Casquinha de siri'], ['Moqueca mista']]);
    assert.equal(executar({ tipo: 'chamar-etapa', mesa: 2, etapa: 'principal' }).ok, false);
  });

  it('o pedido fica completo quando todas as linhas ficam prontas, e sai da fila na entrega', () => {
    const { livro, executar } = salaoDeTeste();
    executar({ tipo: 'abrir-mesa', mesa: 5, pessoas: 2, garcom: 'Rita' });
    const [a, b] = [linha('bobo'), linha('xinxim')];
    executar({ tipo: 'pedir', mesa: 5, pedidoId: novoId('ped'), linhas: [a, b] });
    executar({ tipo: 'iniciar-preparo', linhaId: a.id });
    executar({ tipo: 'marcar-pronto', linhaId: a.id });
    assert.equal(filaDaEstacao(livro.salao, 'cozinha').tickets[0].completo, false);
    executar({ tipo: 'marcar-pronto', linhaId: b.id });
    assert.equal(filaDaEstacao(livro.salao, 'cozinha').tickets[0].completo, true);
    assert.equal(executar({ tipo: 'marcar-entregue', linhaId: a.id }).ok, true);
    assert.equal(executar({ tipo: 'marcar-entregue', linhaId: b.id }).ok, true);
    assert.equal(filaDaEstacao(livro.salao, 'cozinha').tickets.length, 0);
  });

  it('cancelar o que já está no fogo pede o motivo', () => {
    const { livro, executar } = salaoDeTeste();
    executar({ tipo: 'abrir-mesa', mesa: 6, pessoas: 1, garcom: 'Rita' });
    const [antes, fogo] = [linha('mousse'), linha('peixe-frito')];
    executar({ tipo: 'pedir', mesa: 6, pedidoId: novoId('ped'), linhas: [antes, fogo] });
    assert.equal(executar({ tipo: 'cancelar-item', linhaId: antes.id }).ok, true);
    executar({ tipo: 'iniciar-preparo', linhaId: fogo.id });
    assert.deepEqual(executar({ tipo: 'cancelar-item', linhaId: fogo.id }), { ok: false, erro: 'Peixe frito com pirão já está sendo feito. Diga o motivo do cancelamento.', repetido: false });
    assert.equal(executar({ tipo: 'cancelar-item', linhaId: fogo.id, motivo: 'cliente desistiu' }).ok, true);
    assert.deepEqual(linhasDaMesa(livro.salao, 6).map((l) => [l.estado, l.motivoDoCancelamento]), [['cancelada', 'antes do preparo'], ['cancelada', 'cliente desistiu']]);
  });

  it('só fecha a conta com tudo entregue, e a mesa volta livre', () => {
    const { livro, executar } = salaoDeTeste();
    executar({ tipo: 'abrir-mesa', mesa: 7, pessoas: 2, garcom: 'Rita' });
    const suco = linha('suco-cacau', { qtd: 2 });
    executar({ tipo: 'pedir', mesa: 7, pedidoId: novoId('ped'), linhas: [suco] });
    const conta = { tipo: 'fechar-conta' as const, mesa: 7, servico: true, divisao: { modo: 'inteira' as const } };
    assert.deepEqual(executar(conta), { ok: false, erro: 'Ainda falta entregar 1 item da mesa 7.', repetido: false });
    executar({ tipo: 'marcar-pronto', linhaId: suco.id });
    executar({ tipo: 'marcar-entregue', linhaId: suco.id });
    assert.equal(executar(conta).ok, true);
    assert.equal(livro.salao.mesas[7], undefined);
    assert.deepEqual(livro.salao.fechamentos.map((f) => [f.mesa, f.total]), [[7, 3080]]);
    assert.equal(linhasDaMesa(livro.salao, 7).length, 0);
  });
});

describe('livro', () => {
  it('o mesmo comando duas vezes executa uma vez só e devolve o mesmo resultado', () => {
    const { livro, executar } = salaoDeTeste();
    executar({ tipo: 'abrir-mesa', mesa: 3, pessoas: 2, garcom: 'Rita' });
    const pedido = { tipo: 'pedir' as const, mesa: 3, pedidoId: novoId('ped'), linhas: [linha('moqueca-camarao')] };
    const primeira = executar(pedido, 'garcom-rita-0001');
    const segunda = executar(pedido, 'garcom-rita-0001');
    assert.equal(primeira.repetido, false);
    assert.deepEqual(segunda, { ...primeira, repetido: true });
    assert.equal(Object.keys(livro.salao.linhas).length, 1);
    assert.equal(livro.eventosDesde(0).length, 2);
  });

  it('o erro também é guardado: repetir não muda a resposta', () => {
    const { executar } = salaoDeTeste();
    const primeira = executar({ tipo: 'chamar-etapa', mesa: 1, etapa: 'principal' }, 'cmd-erro-0001');
    assert.equal(primeira.ok, false);
    assert.equal(executar({ tipo: 'chamar-etapa', mesa: 1, etapa: 'principal' }, 'cmd-erro-0001').repetido, true);
  });

  it('comando malformado vira erro, não derruba o salão', () => {
    const { livro } = salaoDeTeste();
    assert.deepEqual(livro.executar({ id: 'cmd-ruim-0001', pedido: { tipo: 'pedir', mesa: 1, pedidoId: 'x', linhas: [null] } as never }, new Date()), { ok: false, erro: 'A mesa 1 não está aberta.', repetido: false });
    livro.executar({ id: 'cmd-ruim-0002', pedido: { tipo: 'abrir-mesa', mesa: 1, pessoas: 1, garcom: 'Rita' } }, new Date());
    assert.deepEqual(livro.executar({ id: 'cmd-ruim-0003', pedido: { tipo: 'pedir', mesa: 1, pedidoId: 'pedido-1', linhas: [null] } as never }, new Date()), { ok: false, erro: 'Pedido malformado.', repetido: false });
    assert.equal(livro.executar({ id: 'curto', pedido: { tipo: 'abrir-mesa', mesa: 2, pessoas: 1, garcom: 'Rita' } }, new Date()).ok, false);
  });

  it('avisa quem está ouvindo, na ordem', () => {
    const { livro, executar } = salaoDeTeste();
    const vistos: number[] = [];
    const parar = livro.ouvir((eventos) => vistos.push(...eventos.map((e) => e.seq)));
    executar({ tipo: 'abrir-mesa', mesa: 1, pessoas: 1, garcom: 'Rita' });
    executar({ tipo: 'abrir-mesa', mesa: 2, pessoas: 1, garcom: 'Rita' });
    parar();
    executar({ tipo: 'abrir-mesa', mesa: 3, pessoas: 1, garcom: 'Rita' });
    assert.deepEqual(vistos, [1, 2]);
  });
});
