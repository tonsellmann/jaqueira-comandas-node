// A tela do garçom, no celular: as mesas, a comanda de cada uma e o pedido sendo montado.

import { CARDAPIO, ETAPAS, NOME_DA_ETAPA } from '../dominio/cardapio.js';
import { MESAS } from '../dominio/comandos.js';
import { linhasDaMesa } from '../dominio/salao.js';
import { Conexao, novoId } from './conexao.js';
import { avisar, el, reais, seloDaConexao } from './comum.js';

const conexao = new Conexao('garcom');
const raiz = document.querySelector('[data-garcom]');

const estado = {
  mesa: null,
  etapa: 'entrada',
  pessoas: 2,
  /** O pedido sendo montado, por mesa: { mesa: [{ id, itemId, qtd, pessoa, obs }] } */
  rascunhos: {},
  segurarPrincipal: true,
};

const garcom = (() => {
  try {
    return localStorage.getItem('jaqueira.garcom') || 'Rita';
  } catch {
    return 'Rita';
  }
})();

const NOME_DO_ESTADO = { segurada: 'Segurado', 'na-fila': 'Na fila', preparando: 'No fogo', pronta: 'Pronto', entregue: 'Entregue', cancelada: 'Cancelado' };

function rascunho() {
  return (estado.rascunhos[estado.mesa] ??= []);
}

function desenhar() {
  // Um evento da cozinha redesenha a tela: quem estava digitando a observação não perde o lugar.
  const ativo = document.activeElement;
  const foco = ativo?.getAttribute('aria-label');
  const cursor = ativo?.selectionStart;
  document.querySelector('[data-selo]').replaceChildren(seloDaConexao(conexao));
  raiz.replaceChildren(estado.mesa === null ? mesas() : comanda());
  if (foco && raiz.contains(ativo) === false) {
    const alvo = raiz.querySelector(`[aria-label="${CSS.escape(foco)}"]`);
    alvo?.focus();
    if (alvo && typeof cursor === 'number' && alvo.setSelectionRange) alvo.setSelectionRange(cursor, cursor);
  }
}

function mesas() {
  const { salao } = conexao;
  const botoes = [];
  for (let n = 1; n <= MESAS; n += 1) {
    const aberta = salao.mesas[n];
    const linhas = aberta ? linhasDaMesa(salao, n) : [];
    const prontas = linhas.filter((l) => l.estado === 'pronta').length;
    const seguradas = linhas.some((l) => l.estado === 'segurada');
    const consumo = linhas.filter((l) => l.estado !== 'cancelada').reduce((s, l) => s + l.preco * l.qtd, 0);
    botoes.push(
      el('button', { class: `mesa${aberta ? ' mesa--aberta' : ''}${prontas ? ' mesa--pronta' : ''}`, type: 'button', onclick: () => abrirMesa(n), 'aria-label': `Mesa ${n}${aberta ? `, aberta, ${prontas ? `${prontas} pronto para servir` : 'em andamento'}` : ', livre'}` },
        el('strong', { text: String(n) }),
        aberta ? el('span', { text: prontas ? `${prontas} pronto${prontas > 1 ? 's' : ''}` : reais(consumo) }) : el('span', { text: 'livre' }),
        seguradas ? el('span', { class: 'mesa__segura', text: 'segurando' }) : null),
    );
  }
  return el('section', { class: 'painel' }, el('h1', { class: 'titulo', text: 'Mesas' }), el('div', { class: 'mesas' }, botoes));
}

function abrirMesa(n) {
  estado.mesa = n;
  estado.etapa = 'entrada';
  desenhar();
  scrollTo(0, 0);
}

function comanda() {
  const { salao } = conexao;
  const mesa = salao.mesas[estado.mesa];
  const voltar = el('button', { class: 'voltar', type: 'button', onclick: () => ((estado.mesa = null), desenhar()), text: '← Mesas' });
  if (!mesa) {
    return el('section', { class: 'painel' }, voltar,
      el('h1', { class: 'titulo', text: `Mesa ${estado.mesa}` }),
      el('p', { class: 'apoio', text: 'Mesa livre. Quantas pessoas vão sentar?' }),
      el('div', { class: 'contador' },
        el('button', { type: 'button', 'aria-label': 'Uma pessoa a menos', onclick: () => ((estado.pessoas = Math.max(1, estado.pessoas - 1)), desenhar()), text: '−' }),
        el('output', { text: String(estado.pessoas) }),
        el('button', { type: 'button', 'aria-label': 'Uma pessoa a mais', onclick: () => ((estado.pessoas = Math.min(20, estado.pessoas + 1)), desenhar()), text: '+' })),
      el('button', { class: 'botao', type: 'button', onclick: () => conexao.pedir({ tipo: 'abrir-mesa', mesa: estado.mesa, pessoas: estado.pessoas, garcom }), text: `Abrir a mesa ${estado.mesa}` }));
  }

  const linhas = linhasDaMesa(salao, estado.mesa);
  const seguradasPorEtapa = ETAPAS.filter((etapa) => linhas.some((l) => l.etapa === etapa && l.estado === 'segurada'));
  return el('section', { class: 'painel' }, voltar,
    el('h1', { class: 'titulo', text: `Mesa ${estado.mesa}` }),
    el('p', { class: 'apoio', text: `${mesa.pessoas} ${mesa.pessoas === 1 ? 'pessoa' : 'pessoas'} · ${mesa.garcom}` }),
    seguradasPorEtapa.map((etapa) => el('button', { class: 'botao botao--chamar', type: 'button', onclick: () => conexao.pedir({ tipo: 'chamar-etapa', mesa: estado.mesa, etapa }), text: `Chamar ${NOME_DA_ETAPA[etapa].toLowerCase()}` })),
    linhas.length ? el('ul', { class: 'linhas' }, linhas.map(linhaDaComanda)) : el('p', { class: 'apoio', text: 'Nada pedido ainda.' }),
    cardapio(mesa),
  );
}

function linhaDaComanda(linha) {
  return el('li', { class: `linha linha--${linha.estado}` },
    el('span', { class: 'linha__qtd', text: `${linha.qtd}×` }),
    el('span', { class: 'linha__nome' }, linha.nome, linha.obs ? el('small', { text: linha.obs }) : null, linha.pessoa ? el('small', { text: `pessoa ${linha.pessoa}` }) : null),
    linha.estado === 'pronta'
      ? el('button', { class: 'botao botao--pequeno', type: 'button', onclick: () => conexao.pedir({ tipo: 'marcar-entregue', linhaId: linha.id }), text: 'Entregar' })
      : el('span', { class: `etiqueta etiqueta--${linha.estado}`, text: NOME_DO_ESTADO[linha.estado] }));
}

function cardapio(mesa) {
  const itens = rascunho();
  const temQueEspera = itens.some((l) => ['principal', 'sobremesa'].includes(CARDAPIO.find((c) => c.id === l.itemId)?.etapa));
  const totalDoRascunho = itens.reduce((s, l) => s + CARDAPIO.find((c) => c.id === l.itemId).preco * l.qtd, 0);
  return el('section', { class: 'novo-pedido', 'aria-label': 'Novo pedido' },
    el('h2', { text: 'Novo pedido' }),
    el('div', { class: 'abas', role: 'tablist' },
      ETAPAS.map((etapa) => el('button', { type: 'button', role: 'tab', 'aria-selected': String(estado.etapa === etapa), onclick: () => ((estado.etapa = etapa), desenhar()), text: NOME_DA_ETAPA[etapa] }))),
    el('ul', { class: 'cardapio' },
      CARDAPIO.filter((c) => c.etapa === estado.etapa).map((item) =>
        el('li', {},
          el('button', { type: 'button', class: 'item', onclick: () => adicionar(item.id), 'aria-label': `Adicionar ${item.nome}` },
            el('span', { text: item.nome }), el('span', { class: 'item__preco', text: reais(item.preco) }))))),
    itens.length
      ? el('div', { class: 'rascunho' },
          el('ul', {}, itens.map((linha) => linhaDoRascunho(linha, mesa))),
          temQueEspera
            ? el('label', { class: 'segurar' },
                el('input', { type: 'checkbox', checked: estado.segurarPrincipal, onchange: (e) => ((estado.segurarPrincipal = e.target.checked), desenhar()) }),
                'Segurar principais e sobremesas até eu chamar')
            : null,
          el('button', { class: 'botao', type: 'button', onclick: enviar, text: `Enviar ${itens.reduce((s, l) => s + l.qtd, 0)} itens · ${reais(totalDoRascunho)}` }))
      : null,
  );
}

function linhaDoRascunho(linha, mesa) {
  const item = CARDAPIO.find((c) => c.id === linha.itemId);
  const mudar = (fn) => () => {
    fn();
    desenhar();
  };
  const proximaPessoa = () => (linha.pessoa = linha.pessoa === null ? 1 : linha.pessoa >= mesa.pessoas ? null : linha.pessoa + 1);
  return el('li', { class: 'rascunho__linha' },
    el('div', { class: 'rascunho__topo' },
      el('strong', { text: item.nome }),
      el('div', { class: 'contador contador--pequeno' },
        el('button', { type: 'button', 'aria-label': `Um ${item.nome} a menos`, onclick: mudar(() => (linha.qtd > 1 ? (linha.qtd -= 1) : rascunho().splice(rascunho().indexOf(linha), 1))), text: '−' }),
        el('output', { text: String(linha.qtd) }),
        el('button', { type: 'button', 'aria-label': `Um ${item.nome} a mais`, onclick: mudar(() => (linha.qtd = Math.min(20, linha.qtd + 1))), text: '+' }))),
    el('div', { class: 'rascunho__extra' },
      el('button', { type: 'button', class: 'pessoa', onclick: mudar(proximaPessoa), 'aria-label': 'Trocar de quem é o item', text: linha.pessoa ? `Pessoa ${linha.pessoa}` : 'Da mesa' }),
      el('input', { type: 'text', placeholder: 'Observação', maxlength: '140', value: linha.obs, 'aria-label': `Observação de ${item.nome}`, oninput: (e) => (linha.obs = e.target.value) })));
}

function adicionar(itemId) {
  const linhas = rascunho();
  const mesma = linhas.find((l) => l.itemId === itemId && !l.obs && l.pessoa === null);
  if (mesma) mesma.qtd += 1;
  else linhas.push({ id: novoId(), itemId, qtd: 1, pessoa: null, obs: '' });
  desenhar();
}

function enviar() {
  const linhas = rascunho().map((l) => ({ ...l, segurar: estado.segurarPrincipal }));
  conexao.pedir({ tipo: 'pedir', mesa: estado.mesa, pedidoId: novoId(), linhas });
  estado.rascunhos[estado.mesa] = [];
  desenhar();
}

conexao.addEventListener('mudou', desenhar);
conexao.addEventListener('resultado', (e) => {
  const { resultado } = e.detail;
  if (!resultado.ok) avisar(resultado.erro);
});
conexao.addEventListener('evento', (e) => {
  const evento = e.detail;
  if (evento.tipo === 'item-pronto' && conexao.emDia) {
    const linha = conexao.salao.linhas[evento.linhaId];
    if (linha) avisar(`Mesa ${linha.mesa}: ${linha.nome} pronto`, 'pronto');
  }
});
document.querySelector('[data-voltar]').addEventListener('click', (e) => {
  e.preventDefault();
  estado.mesa = null;
  desenhar();
});

conexao.iniciar();
desenhar();
