// O livro do salão: recebe comandos, decide, grava os fatos numerados e avisa quem está ouvindo.
// Não sabe onde guarda: no servidor é o SQLite (src/servidor/armazenamento-sqlite.ts); na
// demonstração do portfólio, a memória do navegador.

import { decidir, type Comando, type Decisao } from './comandos.ts';
import { aplicarTodos, salaoVazio, type Evento, type Fato, type Salao } from './salao.ts';

export type Resultado = { ok: true; seqs: number[] } | { ok: false; erro: string };

export interface Armazenamento {
  /** O resultado guardado de um comando já processado, ou null. */
  resultadoDe(comandoId: string): Resultado | null;
  /** Grava os fatos e o resultado do comando juntos (tudo ou nada) e devolve os eventos numerados. */
  gravar(comandoId: string, fatos: Fato[], em: string, resultado: (eventos: Evento[]) => Resultado): Evento[];
  eventosDesde(seq: number): Evento[];
}

const ID_DO_COMANDO = /^[A-Za-z0-9_-]{8,64}$/;

export class Livro {
  #armazenamento: Armazenamento;
  #salao: Salao;
  #ouvintes = new Set<(eventos: Evento[]) => void>();

  constructor(armazenamento: Armazenamento) {
    this.#armazenamento = armazenamento;
    this.#salao = aplicarTodos(salaoVazio(), armazenamento.eventosDesde(0));
  }

  get salao(): Salao {
    return this.#salao;
  }

  eventosDesde(seq: number): Evento[] {
    return this.#armazenamento.eventosDesde(seq);
  }

  ouvir(ouvinte: (eventos: Evento[]) => void): () => void {
    this.#ouvintes.add(ouvinte);
    return () => this.#ouvintes.delete(ouvinte);
  }

  /**
   * Executa um comando uma vez só. O mesmo id de novo (o garçom apertou "enviar" duas vezes, ou o
   * Wi-Fi caiu antes da resposta chegar) devolve o resultado da primeira vez, sem gravar nada.
   */
  executar(comando: Comando, agora: Date): Resultado & { repetido: boolean } {
    if (!comando || typeof comando.id !== 'string' || !ID_DO_COMANDO.test(comando.id)) {
      return { ok: false, erro: 'Comando sem identificação.', repetido: false };
    }
    const guardado = this.#armazenamento.resultadoDe(comando.id);
    if (guardado) return { ...guardado, repetido: true };

    let decisao: Decisao;
    try {
      decisao = decidir(this.#salao, comando.pedido);
    } catch {
      decisao = { ok: false, erro: 'Pedido malformado.' };
    }
    const fatos = decisao.ok ? decisao.fatos : [];
    const eventos = this.#armazenamento.gravar(comando.id, fatos, agora.toISOString(), (gravados) =>
      decisao.ok ? { ok: true, seqs: gravados.map((e) => e.seq) } : { ok: false, erro: decisao.erro },
    );
    if (eventos.length) {
      this.#salao = aplicarTodos(this.#salao, eventos);
      for (const ouvinte of this.#ouvintes) ouvinte(eventos);
    }
    const resultado = this.#armazenamento.resultadoDe(comando.id)!;
    return { ...resultado, repetido: false };
  }
}

/** Armazenamento na memória: para os testes e para a demonstração no navegador. */
export function armazenamentoNaMemoria(): Armazenamento {
  const eventos: Evento[] = [];
  const resultados = new Map<string, Resultado>();
  return {
    resultadoDe: (id) => resultados.get(id) ?? null,
    gravar(id, fatos, em, resultado) {
      const novos = fatos.map((fato, i) => ({ ...fato, seq: eventos.length + i + 1, em }) as Evento);
      eventos.push(...novos);
      resultados.set(id, resultado(novos));
      return novos;
    },
    eventosDesde: (seq) => eventos.filter((e) => e.seq > seq),
  };
}
