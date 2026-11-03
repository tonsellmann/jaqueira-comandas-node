import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calcularConta, repartir } from '../src/dominio/conta.ts';
import type { Linha } from '../src/dominio/salao.ts';

const linha = (nome: string, preco: number, extra: Partial<Linha> = {}): Linha => ({
  id: nome, mesa: 1, pedidoId: 'p', itemId: nome, nome, estacao: 'cozinha', etapa: 'principal', qtd: 1, preco, obs: '', pessoa: null,
  estado: 'entregue', pedidaEm: '', liberadaEm: '', prontaEm: null, motivoDoCancelamento: null, ...extra,
});

describe('repartir', () => {
  it('não perde nem inventa centavo', () => {
    assert.deepEqual(repartir(10000, [1, 1, 1]), [3334, 3333, 3333]);
    assert.deepEqual(repartir(1001, [1, 1]), [501, 500]);
    assert.deepEqual(repartir(1000, [3, 1]), [750, 250]);
    assert.deepEqual(repartir(500, [0, 0]), [500, 0]);
    for (const total of [1, 99, 12345, 98765]) {
      for (const pesos of [[1, 2, 3], [7, 7, 7, 7], [1, 0, 5]]) assert.equal(repartir(total, pesos).reduce((s, p) => s + p, 0), total);
    }
  });
});

describe('conta', () => {
  const mesa = [
    linha('Moqueca mista', 15800),
    linha('Caipirinha de umbu', 2600, { qtd: 2, pessoa: 1 }),
    linha('Suco de cajá', 1200, { pessoa: 2 }),
    linha('Cocada de forno', 2200, { estado: 'cancelada' }),
  ];

  it('soma o consumo sem o que foi cancelado e põe os 10%', () => {
    const conta = calcularConta(mesa, { servico: true, divisao: { modo: 'inteira' }, pessoas: 2 });
    assert.ok(conta.ok);
    assert.deepEqual([conta.consumo, conta.servico, conta.total], [22200, 2220, 24420]);
    const semServico = calcularConta(mesa, { servico: false, divisao: { modo: 'inteira' }, pessoas: 2 });
    assert.ok(semServico.ok);
    assert.equal(semServico.total, 22200);
  });

  it('divide igual em três, e as partes somam o total', () => {
    const conta = calcularConta(mesa, { servico: true, divisao: { modo: 'igual', partes: 3 }, pessoas: 2 });
    assert.ok(conta.ok);
    assert.deepEqual(conta.partes.map((p) => p.total), [8140, 8140, 8140]);
    assert.equal(conta.partes.reduce((s, p) => s + p.total, 0), conta.total);
  });

  it('por pessoa: cada um paga o seu, a moqueca da mesa é repartida e os 10% acompanham', () => {
    const conta = calcularConta(mesa, { servico: true, divisao: { modo: 'por-pessoa' }, pessoas: 2 });
    assert.ok(conta.ok);
    assert.deepEqual(conta.partes.map((p) => [p.nome, p.consumo, p.servico, p.total]), [
      ['Pessoa 1', 7900 + 5200, 1310, 14410],
      ['Pessoa 2', 7900 + 1200, 910, 10010],
    ]);
    assert.equal(conta.partes.reduce((s, p) => s + p.total, 0), conta.total);
    assert.deepEqual(conta.partes[1].itens.map((i) => [i.nome, i.valor, i.compartilhado]), [['Moqueca mista', 7900, true], ['Suco de cajá', 1200, false]]);
  });

  it('recusa divisão impossível', () => {
    assert.deepEqual(calcularConta(mesa, { servico: true, divisao: { modo: 'igual', partes: 1 }, pessoas: 2 }), { ok: false, erro: 'Dividir em 2 a 20 partes.' });
  });
});
