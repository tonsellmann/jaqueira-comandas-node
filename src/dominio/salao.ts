// O salão como uma sequência de fatos. Ninguém altera uma comanda: cada ação vira um evento
// numerado, e o estado de cada tela é a soma dos eventos na ordem. O servidor guarda os eventos;
// o garçom, a cozinha, o bar e o caixa aplicam os mesmos eventos com esta mesma função.

import { itemDoCardapio, type Estacao, type Etapa } from './cardapio.ts';

export type EstadoDaLinha = 'segurada' | 'na-fila' | 'preparando' | 'pronta' | 'entregue' | 'cancelada';

/** Um item pedido numa mesa: "2 moquecas mistas, sem coentro, da pessoa 1". */
export interface Linha {
  id: string;
  mesa: number;
  pedidoId: string;
  itemId: string;
  nome: string;
  estacao: Estacao;
  etapa: Etapa;
  qtd: number;
  /** Centavos, por unidade, no momento do pedido. */
  preco: number;
  obs: string;
  /** Quem vai pagar, para dividir a conta; null é da mesa toda. */
  pessoa: number | null;
  estado: EstadoDaLinha;
  pedidaEm: string;
  /** Quando foi para a fila da estação (na hora, ou quando o garçom chamou a etapa). */
  liberadaEm: string | null;
  prontaEm: string | null;
  motivoDoCancelamento: string | null;
}

export interface Mesa {
  numero: number;
  pessoas: number;
  garcom: string;
  abertaEm: string;
}

export interface Fechamento {
  mesa: number;
  total: number;
  fechadaEm: string;
}

export interface Salao {
  /** Número do último evento aplicado. */
  seq: number;
  mesas: Record<number, Mesa>;
  linhas: Record<string, Linha>;
  fechamentos: Fechamento[];
}

export interface LinhaPedida {
  id: string;
  itemId: string;
  qtd: number;
  obs?: string;
  pessoa?: number | null;
  /** Segura até o garçom chamar a etapa (o principal só sai depois da entrada). */
  segurar?: boolean;
}

export type Fato =
  | { tipo: 'mesa-aberta'; mesa: number; pessoas: number; garcom: string }
  | { tipo: 'itens-pedidos'; mesa: number; pedidoId: string; linhas: LinhaPedida[] }
  | { tipo: 'etapa-chamada'; mesa: number; etapa: Etapa }
  | { tipo: 'preparo-iniciado'; linhaId: string }
  | { tipo: 'item-pronto'; linhaId: string }
  | { tipo: 'item-entregue'; linhaId: string }
  | { tipo: 'item-cancelado'; linhaId: string; motivo: string }
  | { tipo: 'conta-fechada'; mesa: number; total: number };

export type Evento = Fato & { seq: number; em: string };

export const salaoVazio = (): Salao => ({ seq: 0, mesas: {}, linhas: {}, fechamentos: [] });

/** Aplica um evento. Evento repetido ou fora de ordem (seq já visto) não muda nada. */
export function aplicar(salao: Salao, evento: Evento): Salao {
  if (evento.seq <= salao.seq) return salao;
  const proximo: Salao = { ...salao, seq: evento.seq };
  const trocarLinha = (id: string, mudanca: Partial<Linha>) => {
    const linha = salao.linhas[id];
    if (linha) proximo.linhas = { ...salao.linhas, [id]: { ...linha, ...mudanca } };
  };

  switch (evento.tipo) {
    case 'mesa-aberta':
      proximo.mesas = { ...salao.mesas, [evento.mesa]: { numero: evento.mesa, pessoas: evento.pessoas, garcom: evento.garcom, abertaEm: evento.em } };
      break;
    case 'itens-pedidos': {
      const linhas = { ...salao.linhas };
      for (const pedida of evento.linhas) {
        const item = itemDoCardapio(pedida.itemId);
        if (!item) continue;
        linhas[pedida.id] = {
          id: pedida.id,
          mesa: evento.mesa,
          pedidoId: evento.pedidoId,
          itemId: item.id,
          nome: item.nome,
          estacao: item.estacao,
          etapa: item.etapa,
          qtd: pedida.qtd,
          preco: item.preco,
          obs: pedida.obs?.trim() ?? '',
          pessoa: pedida.pessoa ?? null,
          estado: pedida.segurar ? 'segurada' : 'na-fila',
          pedidaEm: evento.em,
          liberadaEm: pedida.segurar ? null : evento.em,
          prontaEm: null,
          motivoDoCancelamento: null,
        };
      }
      proximo.linhas = linhas;
      break;
    }
    case 'etapa-chamada': {
      const linhas = { ...salao.linhas };
      for (const linha of Object.values(salao.linhas)) {
        if (linha.mesa === evento.mesa && linha.etapa === evento.etapa && linha.estado === 'segurada') {
          linhas[linha.id] = { ...linha, estado: 'na-fila', liberadaEm: evento.em };
        }
      }
      proximo.linhas = linhas;
      break;
    }
    case 'preparo-iniciado':
      trocarLinha(evento.linhaId, { estado: 'preparando' });
      break;
    case 'item-pronto':
      trocarLinha(evento.linhaId, { estado: 'pronta', prontaEm: evento.em });
      break;
    case 'item-entregue':
      trocarLinha(evento.linhaId, { estado: 'entregue' });
      break;
    case 'item-cancelado':
      trocarLinha(evento.linhaId, { estado: 'cancelada', motivoDoCancelamento: evento.motivo });
      break;
    case 'conta-fechada': {
      const mesas = { ...salao.mesas };
      delete mesas[evento.mesa];
      // As linhas da mesa saem do salão: a próxima ocupação começa limpa.
      proximo.linhas = Object.fromEntries(Object.entries(salao.linhas).filter(([, l]) => l.mesa !== evento.mesa));
      proximo.mesas = mesas;
      proximo.fechamentos = [...salao.fechamentos, { mesa: evento.mesa, total: evento.total, fechadaEm: evento.em }];
      break;
    }
  }
  return proximo;
}

export const aplicarTodos = (salao: Salao, eventos: Evento[]) => eventos.reduce(aplicar, salao);

export const linhasDaMesa = (salao: Salao, mesa: number) =>
  Object.values(salao.linhas)
    .filter((l) => l.mesa === mesa)
    .sort((a, b) => a.pedidaEm.localeCompare(b.pedidaEm));

/** Uma comanda na tela da estação: as linhas de um pedido de uma mesa que vão para ela. */
export interface Ticket {
  mesa: number;
  pedidoId: string;
  liberadoEm: string;
  linhas: Linha[];
  /** Todas prontas: o garçom pode levar tudo junto. */
  completo: boolean;
}

/**
 * A fila de uma estação: os pedidos liberados, do mais antigo para o mais novo, cada um com as
 * suas linhas. Pedido todo pronto sai da fila quando o garçom entrega; o que ainda está segurado
 * aparece à parte, para a cozinha se planejar.
 */
export function filaDaEstacao(salao: Salao, estacao: Estacao): { tickets: Ticket[]; seguradas: Linha[] } {
  const grupos = new Map<string, Linha[]>();
  const seguradas: Linha[] = [];
  for (const linha of Object.values(salao.linhas)) {
    if (linha.estacao !== estacao) continue;
    if (linha.estado === 'segurada') {
      seguradas.push(linha);
      continue;
    }
    if (linha.estado === 'entregue' || linha.estado === 'cancelada') continue;
    const chave = `${linha.mesa}|${linha.pedidoId}|${linha.liberadaEm}`;
    grupos.set(chave, [...(grupos.get(chave) ?? []), linha]);
  }
  const tickets = [...grupos.values()].map((linhas) => ({
    mesa: linhas[0].mesa,
    pedidoId: linhas[0].pedidoId,
    liberadoEm: linhas[0].liberadaEm ?? linhas[0].pedidaEm,
    linhas: linhas.sort((a, b) => a.nome.localeCompare(b.nome)),
    completo: linhas.every((l) => l.estado === 'pronta'),
  }));
  tickets.sort((a, b) => a.liberadoEm.localeCompare(b.liberadoEm) || a.mesa - b.mesa);
  return { tickets, seguradas: seguradas.sort((a, b) => a.mesa - b.mesa) };
}
