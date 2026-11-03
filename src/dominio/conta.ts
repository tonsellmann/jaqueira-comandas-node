// A conta da mesa: o consumo, os 10% e a divisão. Em centavos inteiros. Quando a divisão não fecha
// (R$ 100,00 por 3), os centavos que sobram vão para as primeiras partes: a soma das partes é
// sempre o total, nem um centavo a mais ou a menos.

import type { Linha } from './salao.ts';

export type Divisao = { modo: 'inteira' } | { modo: 'igual'; partes: number } | { modo: 'por-pessoa' };

export interface Parte {
  /** "Mesa", "Parte 2 de 3" ou "Pessoa 1". */
  nome: string;
  consumo: number;
  servico: number;
  total: number;
  itens: Array<{ nome: string; qtd: number; valor: number; compartilhado: boolean }>;
}

export type Conta =
  | { ok: true; consumo: number; servico: number; total: number; partes: Parte[] }
  | { ok: false; erro: string };

export const TAXA_DE_SERVICO = 0.1;

/** Reparte `total` em pedaços proporcionais aos `pesos`, sem perder centavo (maior resto). */
export function repartir(total: number, pesos: number[]): number[] {
  const soma = pesos.reduce((s, p) => s + p, 0);
  if (soma === 0) return pesos.map((_, i) => (i === 0 ? total : 0));
  const exatos = pesos.map((p) => (total * p) / soma);
  const partes = exatos.map(Math.floor);
  let sobra = total - partes.reduce((s, p) => s + p, 0);
  const ordem = exatos.map((e, i) => [e - Math.floor(e), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of ordem) {
    if (sobra <= 0) break;
    partes[i] += 1;
    sobra -= 1;
  }
  return partes;
}

export function calcularConta(linhas: Linha[], opcoes: { servico: boolean; divisao: Divisao; pessoas: number }): Conta {
  const cobradas = linhas.filter((l) => l.estado !== 'cancelada');
  const consumo = cobradas.reduce((s, l) => s + l.preco * l.qtd, 0);
  const servico = opcoes.servico ? Math.round(consumo * TAXA_DE_SERVICO) : 0;
  const total = consumo + servico;
  const itemDe = (l: Linha, valor: number, compartilhado: boolean) => ({ nome: l.nome, qtd: l.qtd, valor, compartilhado });

  const { divisao } = opcoes;
  if (divisao.modo === 'inteira') {
    return { ok: true, consumo, servico, total, partes: [{ nome: 'Mesa', consumo, servico, total, itens: cobradas.map((l) => itemDe(l, l.preco * l.qtd, false)) }] };
  }

  if (divisao.modo === 'igual') {
    if (!Number.isInteger(divisao.partes) || divisao.partes < 2 || divisao.partes > 20) return { ok: false, erro: 'Dividir em 2 a 20 partes.' };
    const consumos = repartir(consumo, Array(divisao.partes).fill(1));
    const servicos = repartir(servico, Array(divisao.partes).fill(1));
    const partes = consumos.map((c, i) => ({
      nome: `Parte ${i + 1} de ${divisao.partes}`,
      consumo: c,
      servico: servicos[i],
      total: c + servicos[i],
      itens: [],
    }));
    return { ok: true, consumo, servico, total, partes };
  }

  // Por pessoa: cada um paga o que é seu; o que é da mesa (sem pessoa) é repartido entre todos.
  const pessoas = opcoes.pessoas;
  const consumoDe = Array<number>(pessoas).fill(0);
  const itensDe: Parte['itens'][] = Array.from({ length: pessoas }, () => []);
  for (const linha of cobradas) {
    const valor = linha.preco * linha.qtd;
    if (linha.pessoa != null && linha.pessoa >= 1 && linha.pessoa <= pessoas) {
      consumoDe[linha.pessoa - 1] += valor;
      itensDe[linha.pessoa - 1].push(itemDe(linha, valor, false));
    } else {
      repartir(valor, Array(pessoas).fill(1)).forEach((v, i) => {
        consumoDe[i] += v;
        itensDe[i].push(itemDe(linha, v, true));
      });
    }
  }
  // Os 10% de cada um, proporcionais ao que consumiu, somando exatamente o serviço da mesa.
  const servicos = repartir(servico, consumoDe);
  const partes = consumoDe.map((c, i) => ({ nome: `Pessoa ${i + 1}`, consumo: c, servico: servicos[i], total: c + servicos[i], itens: itensDe[i] }));
  return { ok: true, consumo, servico, total, partes };
}
