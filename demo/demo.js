// O servidor da demonstração: o mesmo Livro do Node, guardando na memória, e um transporte que
// faz o papel do HTTP e do SSE para as três telas (que estão em iframes desta página).
// O controle de Wi-Fi atrapalha só o garçom: "Caiu" segura tudo nos dois sentidos; "Perde a
// resposta" deixa o comando chegar e executar, mas a resposta não volta, e o garçom tenta de novo.

import { Livro, armazenamentoNaMemoria } from './dominio/livro.js';

const livro = new Livro(armazenamentoNaMemoria());
const assinantes = new Set();
let wifi = 'ok';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

function registrar(texto, classe = '') {
  const lista = document.querySelector('[data-registro]');
  const item = document.createElement('li');
  item.textContent = `${new Date().toLocaleTimeString('pt-BR')} ${texto}`;
  if (classe) item.className = classe;
  lista.append(item);
  lista.parentElement.scrollTop = lista.parentElement.scrollHeight;
}

const DESCRICAO = {
  'abrir-mesa': (p) => `abrir a mesa ${p.mesa}`,
  pedir: (p) => {
    const itens = p.linhas.reduce((s, l) => s + l.qtd, 0);
    return `pedido da mesa ${p.mesa} (${itens} ${itens === 1 ? 'item' : 'itens'})`;
  },
  'chamar-etapa': (p) => `chamar ${p.etapa === 'principal' ? 'os principais' : 'as sobremesas'} da mesa ${p.mesa}`,
  'iniciar-preparo': () => 'começar um prato',
  'marcar-pronto': () => 'prato pronto',
  'marcar-entregue': () => 'entregar um prato',
  'cancelar-item': () => 'cancelar um item',
  'fechar-conta': (p) => `fechar a conta da mesa ${p.mesa}`,
};

function entregar(assinante, eventos) {
  for (const evento of eventos) {
    if (evento.seq <= assinante.visto) continue;
    assinante.visto = evento.seq;
    assinante.ao.evento(evento);
  }
}

livro.ouvir((eventos) => {
  for (const a of assinantes) if (!(a.nome === 'garcom' && wifi === 'fora')) entregar(a, eventos);
});

window.salaoDaDemo = {
  transporte(nome) {
    const garcom = nome === 'garcom';
    return {
      async enviar(comando) {
        await espera(150);
        if (garcom && wifi === 'fora') throw new Error('sem rede');
        const resultado = livro.executar(comando, new Date());
        const descricao = (DESCRICAO[comando.pedido?.tipo] ?? (() => 'comando'))(comando.pedido);
        if (resultado.repetido) registrar(`${nome}: ${descricao} chegou de novo (id ${comando.id.slice(0, 8)}…). Devolvi o resultado guardado; nada foi gravado.`, 'repetido');
        else if (resultado.ok) registrar(`${nome}: ${descricao} → eventos ${resultado.seqs.join(', ')}`);
        else registrar(`${nome}: ${descricao} recusado: ${resultado.erro}`);
        if (garcom && wifi === 'resposta-perdida') {
          registrar(`garcom: a resposta do comando ${comando.id.slice(0, 8)}… se perdeu no Wi-Fi. O celular vai tentar de novo.`, 'perdido');
          throw new Error('resposta perdida');
        }
        return resultado;
      },
      assinar(desde, ao) {
        const assinante = { nome, ao, visto: desde };
        assinantes.add(assinante);
        setTimeout(() => {
          entregar(assinante, livro.eventosDesde(desde));
          ao.emDia();
          ao.online(!(garcom && wifi === 'fora'));
        }, 50);
        return () => assinantes.delete(assinante);
      },
    };
  },
};

function trocarWifi(novo) {
  const antes = wifi;
  wifi = novo;
  for (const b of document.querySelectorAll('[data-wifi]')) b.setAttribute('aria-pressed', String(b.dataset.wifi === novo));
  for (const a of assinantes) {
    if (a.nome !== 'garcom') continue;
    if (novo === 'fora') {
      a.ao.online(false);
    } else if (antes === 'fora') {
      // Como o EventSource reconectando com Last-Event-ID: só o que o celular ainda não viu.
      const perdidos = livro.eventosDesde(a.visto);
      registrar(`garcom: reconectou depois do evento ${a.visto}; ${perdidos.length === 0 ? 'não perdeu nada' : perdidos.length === 1 ? 'mandei o evento que ele perdeu' : `mandei os ${perdidos.length} eventos que ele perdeu`}.`);
      entregar(a, perdidos);
      a.ao.online(true);
    }
  }
  if (novo === 'fora') registrar('garcom: o Wi-Fi caiu. Os pedidos ficam na fila do celular.', 'perdido');
}

/** Um salão em andamento, com o relógio voltado: pedidos de alguns minutos atrás. */
function prepararSalao() {
  let n = 0;
  const id = () => `demo-${String(++n).padStart(6, '0')}`;
  const ha = (min) => new Date(Date.now() - min * 60000);
  const executar = (pedido, minutos) => livro.executar({ id: id(), pedido }, ha(minutos));
  const linha = (itemId, extra = {}) => ({ id: id(), itemId, qtd: 1, ...extra });

  executar({ tipo: 'abrir-mesa', mesa: 2, pessoas: 4, garcom: 'Rita' }, 40);
  const moqueca = linha('moqueca-camarao');
  const bobo = linha('bobo');
  executar({ tipo: 'pedir', mesa: 2, pedidoId: id(), linhas: [moqueca, bobo, linha('suco-caja', { qtd: 4 })] }, 22);
  executar({ tipo: 'iniciar-preparo', linhaId: moqueca.id }, 18);

  executar({ tipo: 'abrir-mesa', mesa: 7, pessoas: 2, garcom: 'Rita' }, 25);
  const abara = linha('abara', { qtd: 2 });
  executar({ tipo: 'pedir', mesa: 7, pedidoId: id(), linhas: [abara, linha('xinxim', { segurar: true }), linha('caipirinha', { qtd: 2 })] }, 14);

  executar({ tipo: 'abrir-mesa', mesa: 12, pessoas: 3, garcom: 'Tião' }, 75);
  const pratos = [linha('moqueca-mista', { pessoa: null }), linha('agua-coco', { pessoa: 1 }), linha('caipirinha', { pessoa: 2, qtd: 2 }), linha('mousse', { pessoa: 3 })];
  executar({ tipo: 'pedir', mesa: 12, pedidoId: id(), linhas: pratos }, 70);
  for (const p of pratos) {
    executar({ tipo: 'marcar-pronto', linhaId: p.id }, 45);
    executar({ tipo: 'marcar-entregue', linhaId: p.id }, 44);
  }
}

prepararSalao();
registrar(`salão aberto com ${livro.salao.seq} eventos: mesas 2, 7 e 12 em andamento.`);

document.addEventListener('click', (e) => {
  const botao = e.target.closest('[data-wifi]');
  if (botao) trocarWifi(botao.dataset.wifi);
  const aba = e.target.closest('[data-aba]');
  if (aba) {
    for (const b of document.querySelectorAll('[data-aba]')) b.setAttribute('aria-selected', String(b === aba));
    for (const q of document.querySelectorAll('[data-quadro]')) q.classList.toggle('ativo', q.dataset.quadro === aba.dataset.aba);
  }
});

// As telas só carregam depois que o servidor existe. A fila do celular de outra visita não vale aqui.
for (const nome of ['garcom', 'cozinha', 'caixa']) {
  try {
    localStorage.removeItem(`jaqueira.fila.${nome}`);
  } catch {
    // sem armazenamento
  }
}
for (const quadro of document.querySelectorAll('iframe[data-src]')) quadro.src = quadro.dataset.src;
