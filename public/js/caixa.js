// O caixa: as mesas abertas, a conta de cada uma, os 10% e a divisão.

import { calcularConta } from '../dominio/conta.js';
import { linhasDaMesa } from '../dominio/salao.js';
import { Conexao } from './conexao.js';
import { avisar, el, hora, reais, seloDaConexao } from './comum.js';

const conexao = new Conexao('caixa');
const raiz = document.querySelector('[data-caixa]');
const estado = { mesa: null, servico: true, modo: 'inteira', partes: 2 };

function divisao() {
  if (estado.modo === 'igual') return { modo: 'igual', partes: estado.partes };
  return { modo: estado.modo };
}

function desenhar() {
  document.querySelector('[data-selo]').replaceChildren(seloDaConexao(conexao));
  const { salao } = conexao;
  const abertas = Object.values(salao.mesas).sort((a, b) => a.numero - b.numero);
  if (estado.mesa !== null && !salao.mesas[estado.mesa]) estado.mesa = null;

  const lista = el('section', { class: 'caixa__mesas', 'aria-label': 'Mesas abertas' },
    el('h1', { class: 'titulo', text: 'Mesas abertas' }),
    abertas.length
      ? el('ul', {}, abertas.map((mesa) => {
          const linhas = linhasDaMesa(salao, mesa.numero);
          const consumo = linhas.filter((l) => l.estado !== 'cancelada').reduce((s, l) => s + l.preco * l.qtd, 0);
          const pendentes = linhas.filter((l) => l.estado !== 'entregue' && l.estado !== 'cancelada').length;
          return el('li', {},
            el('button', { type: 'button', class: 'caixa__mesa', 'aria-pressed': String(estado.mesa === mesa.numero), onclick: () => ((estado.mesa = mesa.numero), desenhar()) },
              el('strong', { text: `Mesa ${mesa.numero}` }),
              el('span', { text: pendentes ? `${pendentes} a entregar` : 'tudo entregue' }),
              el('span', { class: 'caixa__valor', text: reais(consumo) })));
        }))
      : el('p', { class: 'apoio', text: conexao.emDia ? 'Nenhuma mesa aberta.' : 'Carregando…' }),
    fechamentosDoDia(salao));

  raiz.replaceChildren(lista, estado.mesa === null ? el('section', { class: 'caixa__conta caixa__conta--vazia' }, el('p', { text: 'Escolha uma mesa para ver a conta.' })) : conta(salao));
}

function conta(salao) {
  const mesa = salao.mesas[estado.mesa];
  const linhas = linhasDaMesa(salao, mesa.numero);
  const resultado = calcularConta(linhas, { servico: estado.servico, divisao: divisao(), pessoas: mesa.pessoas });
  const pendentes = linhas.filter((l) => l.estado !== 'entregue' && l.estado !== 'cancelada');
  const opcao = (modo, texto) => el('button', { type: 'button', role: 'radio', 'aria-checked': String(estado.modo === modo), onclick: () => ((estado.modo = modo), desenhar()), text: texto });

  return el('section', { class: 'caixa__conta', 'aria-label': `Conta da mesa ${mesa.numero}` },
    el('h2', { class: 'titulo', text: `Mesa ${mesa.numero}` }),
    el('p', { class: 'apoio', text: `${mesa.pessoas} ${mesa.pessoas === 1 ? 'pessoa' : 'pessoas'} · aberta às ${hora(mesa.abertaEm)} · ${mesa.garcom}` }),
    el('table', { class: 'extrato' },
      el('tbody', {}, linhas.map((l) => el('tr', { class: l.estado === 'cancelada' ? 'extrato--cancelada' : '' },
        el('td', { text: `${l.qtd}× ${l.nome}${l.pessoa ? ` (pessoa ${l.pessoa})` : ''}` }),
        el('td', { text: l.estado === 'cancelada' ? 'cancelado' : reais(l.preco * l.qtd) }))))),
    el('label', { class: 'segurar' },
      el('input', { type: 'checkbox', checked: estado.servico, onchange: (e) => ((estado.servico = e.target.checked), desenhar()) }),
      'Serviço de 10%'),
    el('div', { class: 'abas', role: 'radiogroup', 'aria-label': 'Como dividir' },
      opcao('inteira', 'Conta inteira'), opcao('igual', 'Dividir igual'), opcao('por-pessoa', 'Por pessoa')),
    estado.modo === 'igual'
      ? el('div', { class: 'contador' },
          el('button', { type: 'button', 'aria-label': 'Uma parte a menos', onclick: () => ((estado.partes = Math.max(2, estado.partes - 1)), desenhar()), text: '−' }),
          el('output', { text: `${estado.partes} partes` }),
          el('button', { type: 'button', 'aria-label': 'Uma parte a mais', onclick: () => ((estado.partes = Math.min(20, estado.partes + 1)), desenhar()), text: '+' }))
      : null,
    resultado.ok
      ? el('div', { class: 'partes' },
          resultado.partes.map((p) => el('div', { class: 'parte' },
            el('strong', { text: p.nome }),
            p.itens.length && estado.modo === 'por-pessoa' ? el('small', { text: p.itens.map((i) => `${i.nome}${i.compartilhado ? ' (dividido)' : ''}`).join(', ') }) : null,
            el('span', { text: estado.servico ? `${reais(p.consumo)} + ${reais(p.servico)}` : '' }),
            el('b', { text: reais(p.total) }))),
          el('p', { class: 'total', text: `Total ${reais(resultado.total)}` }))
      : el('p', { class: 'aviso aviso--erro', text: resultado.erro }),
    pendentes.length ? el('p', { class: 'apoio apoio--alerta', text: `Falta entregar: ${pendentes.map((l) => l.nome).join(', ')}.` }) : null,
    el('button', {
      type: 'button',
      class: 'botao',
      disabled: pendentes.length > 0 || !resultado.ok,
      onclick: () => conexao.pedir({ tipo: 'fechar-conta', mesa: mesa.numero, servico: estado.servico, divisao: divisao() }),
      text: `Fechar a conta da mesa ${mesa.numero}`,
    }));
}

function fechamentosDoDia(salao) {
  if (!salao.fechamentos.length) return null;
  const total = salao.fechamentos.reduce((s, f) => s + f.total, 0);
  return el('div', { class: 'fechamentos' },
    el('h2', { text: `Fechadas hoje · ${reais(total)}` }),
    el('ul', {}, [...salao.fechamentos].reverse().slice(0, 8).map((f) => el('li', { text: `${hora(f.fechadaEm)} · Mesa ${f.mesa} · ${reais(f.total)}` }))));
}

conexao.addEventListener('mudou', desenhar);
conexao.addEventListener('resultado', (e) => {
  const { comando, resultado } = e.detail;
  if (!resultado.ok) avisar(resultado.erro);
  else if (comando.pedido.tipo === 'fechar-conta') avisar(`Mesa ${comando.pedido.mesa} fechada.`, 'pronto');
});

conexao.iniciar();
desenhar();
