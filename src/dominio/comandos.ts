// O que cada tela pede, e o que o salão responde. O comando é um pedido; o servidor decide se ele
// vira fatos. Cada comando leva um id criado no aparelho de quem pediu: se o Wi-Fi cair depois do
// envio e o garçom tentar de novo, o mesmo id chega duas vezes e o pedido não duplica (quem guarda
// os ids é o registro, em src/servidor/registro.ts).

import { itemDoCardapio, type Etapa } from './cardapio.ts';
import { calcularConta, type Divisao } from './conta.ts';
import { linhasDaMesa, type Fato, type LinhaPedida, type Salao } from './salao.ts';

export const MESAS = 20;

export type Pedido =
  | { tipo: 'abrir-mesa'; mesa: number; pessoas: number; garcom: string }
  | { tipo: 'pedir'; mesa: number; pedidoId: string; linhas: LinhaPedida[] }
  | { tipo: 'chamar-etapa'; mesa: number; etapa: Etapa }
  | { tipo: 'iniciar-preparo'; linhaId: string }
  | { tipo: 'marcar-pronto'; linhaId: string }
  | { tipo: 'marcar-entregue'; linhaId: string }
  | { tipo: 'cancelar-item'; linhaId: string; motivo?: string }
  | { tipo: 'fechar-conta'; mesa: number; servico: boolean; divisao: Divisao };

export interface Comando {
  /** Criado no aparelho (UUID): a chave que impede o pedido em dobro. */
  id: string;
  pedido: Pedido;
}

export type Decisao = { ok: true; fatos: Fato[] } | { ok: false; erro: string };

const erro = (mensagem: string): Decisao => ({ ok: false, erro: mensagem });
const ID = /^[A-Za-z0-9_-]{6,64}$/;

export function decidir(salao: Salao, pedido: Pedido): Decisao {
  switch (pedido.tipo) {
    case 'abrir-mesa': {
      if (!Number.isInteger(pedido.mesa) || pedido.mesa < 1 || pedido.mesa > MESAS) return erro(`Mesa de 1 a ${MESAS}.`);
      if (salao.mesas[pedido.mesa]) return erro(`A mesa ${pedido.mesa} já está aberta.`);
      if (!Number.isInteger(pedido.pessoas) || pedido.pessoas < 1 || pedido.pessoas > 20) return erro('Quantas pessoas na mesa? De 1 a 20.');
      const garcom = String(pedido.garcom ?? '').trim().slice(0, 40);
      if (!garcom) return erro('Quem está atendendo a mesa?');
      return { ok: true, fatos: [{ tipo: 'mesa-aberta', mesa: pedido.mesa, pessoas: pedido.pessoas, garcom }] };
    }

    case 'pedir': {
      const mesa = salao.mesas[pedido.mesa];
      if (!mesa) return erro(`A mesa ${pedido.mesa} não está aberta.`);
      if (!ID.test(pedido.pedidoId ?? '')) return erro('Pedido sem identificação.');
      if (!Array.isArray(pedido.linhas) || pedido.linhas.length === 0) return erro('O pedido está vazio.');
      if (pedido.linhas.length > 40) return erro('Pedido grande demais: divida em dois.');
      const ids = new Set<string>();
      for (const linha of pedido.linhas) {
        const item = itemDoCardapio(linha.itemId);
        if (!item) return erro('Item fora do cardápio.');
        if (!ID.test(linha.id ?? '') || ids.has(linha.id) || salao.linhas[linha.id]) return erro('Item do pedido com identificação repetida.');
        ids.add(linha.id);
        if (!Number.isInteger(linha.qtd) || linha.qtd < 1 || linha.qtd > 20) return erro(`Quantidade de ${item.nome}: de 1 a 20.`);
        if ((linha.obs ?? '').length > 140) return erro('Observação longa demais: até 140 letras.');
        if (linha.pessoa != null && (!Number.isInteger(linha.pessoa) || linha.pessoa < 1 || linha.pessoa > mesa.pessoas)) {
          return erro(`A mesa ${pedido.mesa} tem ${mesa.pessoas} pessoas.`);
        }
      }
      const linhas = pedido.linhas.map((l) => ({
        id: l.id,
        itemId: l.itemId,
        qtd: l.qtd,
        obs: (l.obs ?? '').trim(),
        pessoa: l.pessoa ?? null,
        // Bebida e entrada não esperam ninguém.
        segurar: Boolean(l.segurar) && (itemDoCardapio(l.itemId)!.etapa === 'principal' || itemDoCardapio(l.itemId)!.etapa === 'sobremesa'),
      }));
      return { ok: true, fatos: [{ tipo: 'itens-pedidos', mesa: pedido.mesa, pedidoId: pedido.pedidoId, linhas }] };
    }

    case 'chamar-etapa': {
      if (!salao.mesas[pedido.mesa]) return erro(`A mesa ${pedido.mesa} não está aberta.`);
      const seguradas = linhasDaMesa(salao, pedido.mesa).filter((l) => l.etapa === pedido.etapa && l.estado === 'segurada');
      if (seguradas.length === 0) return erro('Não tem nada segurado nessa etapa.');
      return { ok: true, fatos: [{ tipo: 'etapa-chamada', mesa: pedido.mesa, etapa: pedido.etapa }] };
    }

    case 'iniciar-preparo':
    case 'marcar-pronto':
    case 'marcar-entregue':
    case 'cancelar-item': {
      const linha = salao.linhas[pedido.linhaId];
      if (!linha) return erro('Esse item não está mais no salão.');
      if (pedido.tipo === 'iniciar-preparo') {
        if (linha.estado !== 'na-fila') return erro(`${linha.nome} não está na fila.`);
        return { ok: true, fatos: [{ tipo: 'preparo-iniciado', linhaId: linha.id }] };
      }
      if (pedido.tipo === 'marcar-pronto') {
        if (linha.estado !== 'na-fila' && linha.estado !== 'preparando') return erro(`${linha.nome} não está em preparo.`);
        return { ok: true, fatos: [{ tipo: 'item-pronto', linhaId: linha.id }] };
      }
      if (pedido.tipo === 'marcar-entregue') {
        if (linha.estado !== 'pronta') return erro(`${linha.nome} ainda não ficou pronto.`);
        return { ok: true, fatos: [{ tipo: 'item-entregue', linhaId: linha.id }] };
      }
      if (linha.estado === 'entregue' || linha.estado === 'cancelada') return erro(`${linha.nome} já foi ${linha.estado === 'entregue' ? 'entregue' : 'cancelado'}.`);
      const motivo = String(pedido.motivo ?? '').trim().slice(0, 140);
      // O que já foi para o fogo custou ingrediente: cancelar pede o porquê, para o fechamento do dia.
      const comecou = linha.estado === 'preparando' || linha.estado === 'pronta';
      if (comecou && !motivo) return erro(`${linha.nome} já está sendo feito. Diga o motivo do cancelamento.`);
      return { ok: true, fatos: [{ tipo: 'item-cancelado', linhaId: linha.id, motivo: motivo || 'antes do preparo' }] };
    }

    case 'fechar-conta': {
      const mesa = salao.mesas[pedido.mesa];
      if (!mesa) return erro(`A mesa ${pedido.mesa} não está aberta.`);
      const pendentes = linhasDaMesa(salao, pedido.mesa).filter((l) => l.estado !== 'entregue' && l.estado !== 'cancelada');
      if (pendentes.length) {
        return erro(`Ainda ${pendentes.length === 1 ? 'falta entregar 1 item' : `faltam entregar ${pendentes.length} itens`} da mesa ${pedido.mesa}.`);
      }
      const conta = calcularConta(linhasDaMesa(salao, pedido.mesa), { servico: pedido.servico, divisao: pedido.divisao, pessoas: mesa.pessoas });
      if (!conta.ok) return erro(conta.erro);
      return { ok: true, fatos: [{ tipo: 'conta-fechada', mesa: pedido.mesa, total: conta.total }] };
    }
  }
}
