// A ligação de cada tela com o salão. Os comandos vão para uma fila guardada no aparelho e saem em
// ordem; se a rede cair, ficam esperando e saem quando ela volta, com o mesmo id, então nada
// duplica. Os eventos chegam por SSE e passam pelo mesmo `aplicar` que o servidor usa.

import { aplicar, salaoVazio } from '../dominio/salao.js';

/**
 * Id do comando. O crypto.randomUUID só existe em página segura (https ou localhost), e no salão
 * o celular do garçom abre o servidor pelo IP da rede local, em http. O getRandomValues existe nos
 * dois casos.
 */
export function novoId() {
  if (typeof crypto.randomUUID === 'function' && window.isSecureContext) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** O transporte de verdade: POST para os comandos, EventSource para os eventos. */
export function transporteHttp() {
  return {
    async enviar(comando) {
      const resposta = await fetch('/api/comandos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(comando),
      });
      // 5xx é falha do servidor: o comando fica na fila e sai de novo.
      if (resposta.status >= 500) throw new Error(`servidor respondeu ${resposta.status}`);
      return resposta.json();
    },
    assinar(desde, { evento, emDia, online }) {
      // O EventSource reconecta sozinho e manda o Last-Event-ID: o servidor continua de onde parou.
      const fonte = new EventSource(`/api/eventos?desde=${desde}`);
      fonte.addEventListener('evento', (e) => evento(JSON.parse(e.data)));
      fonte.addEventListener('em-dia', () => emDia());
      fonte.addEventListener('open', () => online(true));
      fonte.addEventListener('error', () => online(false));
      return () => fonte.close();
    },
  };
}

/** Na demonstração do portfólio, a página de fora faz o papel do servidor. */
function transportePadrao() {
  try {
    if (window.parent !== window && window.parent.salaoDaDemo) return window.parent.salaoDaDemo.transporte(window.name || 'tela');
  } catch {
    // Página de outra origem: segue com o transporte de verdade.
  }
  return transporteHttp();
}

export class Conexao extends EventTarget {
  constructor(nome, transporte = transportePadrao()) {
    super();
    this.nome = nome;
    this.transporte = transporte;
    this.salao = salaoVazio();
    this.emDia = false;
    this.online = navigator.onLine;
    this.fila = this.#lerFila();
    this.enviando = false;
    this.espera = 1000;
  }

  get chave() {
    return `jaqueira.fila.${this.nome}`;
  }

  #lerFila() {
    try {
      return JSON.parse(localStorage.getItem(this.chave) ?? '[]');
    } catch {
      return [];
    }
  }

  #guardarFila() {
    try {
      localStorage.setItem(this.chave, JSON.stringify(this.fila));
    } catch {
      // Sem armazenamento (aba anônima): a fila vive só na memória.
    }
  }

  #mudou() {
    this.dispatchEvent(new Event('mudou'));
  }

  iniciar() {
    this.transporte.assinar(this.salao.seq, {
      evento: (evento) => {
        const antes = this.salao;
        this.salao = aplicar(this.salao, evento);
        if (this.salao !== antes) {
          this.dispatchEvent(new CustomEvent('evento', { detail: evento }));
          this.#mudou();
        }
      },
      emDia: () => {
        this.emDia = true;
        this.#mudou();
      },
      online: (online) => {
        this.online = online;
        this.#mudou();
        if (online) this.esvaziar();
      },
    });
    addEventListener('online', () => this.esvaziar());
    this.esvaziar();
    return this;
  }

  /** Põe o pedido na fila e tenta mandar. O resultado chega no evento "resultado". */
  pedir(pedido) {
    const comando = { id: novoId(), pedido };
    this.fila.push(comando);
    this.#guardarFila();
    this.#mudou();
    this.esvaziar();
    return comando.id;
  }

  async esvaziar() {
    if (this.enviando) return;
    this.enviando = true;
    try {
      while (this.fila.length) {
        const comando = this.fila[0];
        let resultado;
        try {
          resultado = await this.transporte.enviar(comando);
        } catch {
          // Sem rede: tenta de novo daqui a pouco, cada vez esperando um pouco mais.
          this.online = false;
          this.#mudou();
          setTimeout(() => this.esvaziar(), this.espera);
          this.espera = Math.min(this.espera * 2, 15000);
          return;
        }
        this.espera = 1000;
        this.online = true;
        this.fila.shift();
        this.#guardarFila();
        this.dispatchEvent(new CustomEvent('resultado', { detail: { comando, resultado } }));
        this.#mudou();
      }
    } finally {
      this.enviando = false;
    }
  }
}
