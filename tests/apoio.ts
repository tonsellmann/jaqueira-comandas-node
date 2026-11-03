import { Livro, armazenamentoNaMemoria } from '../src/dominio/livro.ts';
import type { Pedido } from '../src/dominio/comandos.ts';
import type { LinhaPedida } from '../src/dominio/salao.ts';

let contador = 0;
export const novoId = (prefixo = 'id') => `${prefixo}-${String(++contador).padStart(6, '0')}`;

/** Um livro na memória, com o relógio andando um minuto a cada comando. */
export function salaoDeTeste(inicio = new Date('2026-11-06T19:00:00-03:00')) {
  const livro = new Livro(armazenamentoNaMemoria());
  let agora = inicio.getTime();
  const executar = (pedido: Pedido, id = novoId('cmd')) => {
    agora += 60_000;
    return livro.executar({ id, pedido }, new Date(agora));
  };
  return { livro, executar };
}

export const linha = (itemId: string, extra: Partial<LinhaPedida> = {}): LinhaPedida => ({ id: novoId('lin'), itemId, qtd: 1, ...extra });
