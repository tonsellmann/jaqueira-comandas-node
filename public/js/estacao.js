// A tela da cozinha e do bar: os pedidos na ordem em que chegaram, com o tempo de cada um.
// Tocar num item avança: na fila → no fogo → pronto. Pedido todo pronto fica verde.

import { itemDoCardapio } from '../dominio/cardapio.js';
import { filaDaEstacao } from '../dominio/salao.js';
import { Conexao } from './conexao.js';
import { avisar, el, hora, minutosDesde, seloDaConexao } from './comum.js';

const pedida = new URLSearchParams(location.search).get('estacao');
const estacao = pedida === 'bar' || (!pedida && location.pathname.endsWith('/bar')) ? 'bar' : 'cozinha';
document.title = `${estacao === 'bar' ? 'Bar' : 'Cozinha'} · Jaqueira`;
document.querySelector(`[data-estacao="${estacao}"]`)?.setAttribute('aria-current', 'page');

const conexao = new Conexao(estacao);
const raiz = document.querySelector('[data-estacao-fila]');

/** Verde até o tempo de preparo, amarelo até 1,5×, vermelho depois. */
function ritmo(ticket, agora) {
  const esperado = Math.max(...ticket.linhas.map((l) => itemDoCardapio(l.itemId)?.preparo ?? 15));
  const passados = minutosDesde(ticket.liberadoEm, agora);
  return { passados, nivel: passados <= esperado ? 'em-dia' : passados <= esperado * 1.5 ? 'atencao' : 'atrasado' };
}

function avancar(linha) {
  if (linha.estado === 'na-fila') conexao.pedir({ tipo: 'iniciar-preparo', linhaId: linha.id });
  else if (linha.estado === 'preparando') conexao.pedir({ tipo: 'marcar-pronto', linhaId: linha.id });
}

function desenhar() {
  document.querySelector('[data-selo]').replaceChildren(seloDaConexao(conexao));
  const agora = Date.now();
  const { tickets, seguradas } = filaDaEstacao(conexao.salao, estacao);
  const cartoes = tickets.map((ticket) => {
    const { passados, nivel } = ritmo(ticket, agora);
    return el('article', { class: `ticket ticket--${ticket.completo ? 'completo' : nivel}`, 'aria-label': `Mesa ${ticket.mesa}, há ${passados} minutos` },
      el('header', { class: 'ticket__topo' },
        el('strong', { text: `Mesa ${ticket.mesa}` }),
        el('span', { class: 'ticket__tempo', text: ticket.completo ? 'Pronto: chamar o garçom' : `${passados} min · ${hora(ticket.liberadoEm)}` })),
      el('ul', {}, ticket.linhas.map((linha) =>
        el('li', {},
          el('button', {
            type: 'button',
            class: `prato prato--${linha.estado}`,
            disabled: linha.estado === 'pronta',
            onclick: () => avancar(linha),
            'aria-label': `${linha.qtd} ${linha.nome}, ${linha.estado === 'na-fila' ? 'na fila: tocar para começar' : linha.estado === 'preparando' ? 'no fogo: tocar quando ficar pronto' : 'pronto'}`,
          },
            el('span', { class: 'prato__qtd', text: String(linha.qtd) }),
            el('span', { class: 'prato__nome' }, linha.nome, linha.obs ? el('em', { text: linha.obs }) : null),
            el('span', { class: 'prato__estado', text: linha.estado === 'na-fila' ? 'Começar' : linha.estado === 'preparando' ? 'No fogo' : 'Pronto' }))))));
  });

  raiz.replaceChildren(
    cartoes.length ? el('div', { class: 'tickets' }, cartoes) : el('p', { class: 'vazio', text: conexao.emDia ? 'Nenhum pedido na fila.' : 'Carregando os pedidos…' }),
    seguradas.length
      ? el('section', { class: 'seguradas', 'aria-label': 'Segurados pelo garçom' },
          el('h2', { text: 'Vem pela frente (o garçom chama)' }),
          el('ul', {}, seguradas.map((l) => el('li', { text: `Mesa ${l.mesa}: ${l.qtd} ${l.nome}` }))))
      : null,
  );
}

function relogio() {
  document.querySelector('[data-relogio]').textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

conexao.addEventListener('mudou', desenhar);
conexao.addEventListener('resultado', (e) => {
  if (!e.detail.resultado.ok) avisar(e.detail.resultado.erro);
});
// Pedido novo faz barulho? Não: cozinha já é barulhenta. O cartão novo entra com destaque.
conexao.addEventListener('evento', (e) => {
  if (conexao.emDia && (e.detail.tipo === 'itens-pedidos' || e.detail.tipo === 'etapa-chamada')) {
    requestAnimationFrame(() => raiz.querySelector('.ticket:last-of-type')?.classList.add('ticket--novo'));
  }
});
setInterval(() => {
  relogio();
  desenhar();
}, 30_000);

relogio();
conexao.iniciar();
desenhar();
