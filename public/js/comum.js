// Formatos e pedaços de tela que as três telas usam.

export const reais = (centavos) => (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const hora = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** Minutos inteiros desde um momento. */
export const minutosDesde = (iso, agora = Date.now()) => Math.max(0, Math.floor((agora - Date.parse(iso)) / 60000));

export function el(tag, atributos = {}, ...filhos) {
  const no = document.createElement(tag);
  for (const [k, v] of Object.entries(atributos)) {
    if (v == null || v === false) continue;
    if (k === 'class') no.className = v;
    else if (k === 'text') no.textContent = v;
    else if (k.startsWith('on')) no.addEventListener(k.slice(2), v);
    else no.setAttribute(k, v === true ? '' : v);
  }
  no.append(...filhos.flat().filter((f) => f != null && f !== false));
  return no;
}

/** O selo de conexão no topo: "Ao vivo", "Carregando" ou "Sem conexão · 2 na fila". */
export function seloDaConexao(conexao) {
  const naFila = conexao.fila.length;
  if (!conexao.online) return el('span', { class: 'selo selo--fora', role: 'status', text: naFila ? `Sem conexão · ${naFila} na fila` : 'Sem conexão' });
  if (naFila) return el('span', { class: 'selo selo--enviando', role: 'status', text: `Enviando ${naFila}…` });
  if (!conexao.emDia) return el('span', { class: 'selo', role: 'status', text: 'Carregando' });
  return el('span', { class: 'selo selo--vivo', role: 'status', text: 'Ao vivo' });
}

/** Aviso que some sozinho. */
export function avisar(texto, tipo = 'erro') {
  const caixa = document.querySelector('[data-avisos]');
  if (!caixa) return;
  const aviso = el('p', { class: `aviso aviso--${tipo}`, role: tipo === 'erro' ? 'alert' : 'status', text: texto });
  caixa.append(aviso);
  setTimeout(() => aviso.remove(), 5000);
}
