// O servidor de verdade, numa porta livre, com o SQLite num arquivo temporário.
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { Livro } from '../src/dominio/livro.ts';
import { criarServidor } from '../src/servidor/app.ts';
import { armazenamentoSqlite } from '../src/servidor/armazenamento-sqlite.ts';
import type { Server } from 'node:http';

let pasta: string;
let base: string;
let servidor: Server;
let armazenamento: ReturnType<typeof armazenamentoSqlite>;

before(async () => {
  pasta = mkdtempSync(join(tmpdir(), 'salao-'));
  armazenamento = armazenamentoSqlite(join(pasta, 'salao.db'));
  servidor = criarServidor(new Livro(armazenamento));
  await new Promise<void>((pronto) => servidor.listen(0, '127.0.0.1', pronto));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});

after(() => {
  servidor.closeAllConnections();
  servidor.close();
  armazenamento.fechar();
  rmSync(pasta, { recursive: true, force: true });
});

const enviar = (comando: unknown) =>
  fetch(`${base}/api/comandos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(comando) });

/** Lê eventos SSE até juntar `quantos` (ou o "em-dia"), e fecha a conexão. */
async function lerEventos(caminho: string, quantos: number, headers: Record<string, string> = {}) {
  const controle = new AbortController();
  const resposta = await fetch(`${base}${caminho}`, { headers, signal: controle.signal });
  const leitor = resposta.body!.pipeThrough(new TextDecoderStream()).getReader();
  const eventos: Array<{ seq: number; tipo: string }> = [];
  let buffer = '';
  let emDia = false;
  while (eventos.length < quantos) {
    const { value, done } = await leitor.read();
    if (done) break;
    buffer += value;
    let fim;
    while ((fim = buffer.indexOf('\n\n')) >= 0) {
      const bloco = buffer.slice(0, fim);
      buffer = buffer.slice(fim + 2);
      if (bloco.includes('event: em-dia')) emDia = true;
      const dados = bloco.split('\n').find((l) => l.startsWith('data: '));
      if (bloco.includes('event: evento') && dados) eventos.push(JSON.parse(dados.slice(6)));
    }
  }
  controle.abort();
  return { eventos, emDia, tipo: resposta.headers.get('content-type') };
}

describe('servidor', () => {
  it('executa o comando e repete o resultado guardado quando o mesmo id chega de novo', async () => {
    const abrir = { id: 'garcom-0000-0001', pedido: { tipo: 'abrir-mesa', mesa: 4, pessoas: 2, garcom: 'Rita' } };
    const primeira = await (await enviar(abrir)).json();
    const segunda = await (await enviar(abrir)).json();
    assert.deepEqual(primeira, { ok: true, seqs: [1], repetido: false });
    assert.deepEqual(segunda, { ok: true, seqs: [1], repetido: true });

    const pedir = { id: 'garcom-0000-0002', pedido: { tipo: 'pedir', mesa: 4, pedidoId: 'pedido-0001', linhas: [{ id: 'linha-0001', itemId: 'abara', qtd: 2 }] } };
    // O Wi-Fi do garçom manda o mesmo pedido três vezes, ao mesmo tempo
    const respostas = await Promise.all([enviar(pedir), enviar(pedir), enviar(pedir)]);
    const corpos = await Promise.all(respostas.map((r) => r.json()));
    assert.equal(corpos.filter((c) => c.repetido === false).length, 1);
    assert.equal(corpos.filter((c) => c.repetido === true).length, 2);
    assert.equal(armazenamento.eventosDesde(0).length, 2);
  });

  it('erro de negócio é 422, JSON quebrado é 400 e corpo gigante é 413', async () => {
    const recusa = await enviar({ id: 'garcom-0000-0003', pedido: { tipo: 'abrir-mesa', mesa: 4, pessoas: 2, garcom: 'Rita' } });
    assert.equal(recusa.status, 422);
    assert.deepEqual(await recusa.json(), { ok: false, erro: 'A mesa 4 já está aberta.', repetido: false });
    const quebrado = await fetch(`${base}/api/comandos`, { method: 'POST', body: '{ isso não é json' });
    assert.equal(quebrado.status, 400);
    const gigante = await fetch(`${base}/api/comandos`, { method: 'POST', body: 'x'.repeat(70 * 1024) });
    assert.equal(gigante.status, 413);
  });

  it('o SSE manda o passado, avisa que está em dia e continua ao vivo', async () => {
    const leitura = lerEventos('/api/eventos', 3);
    await new Promise((r) => setTimeout(r, 100));
    await enviar({ id: 'garcom-0000-0004', pedido: { tipo: 'abrir-mesa', mesa: 8, pessoas: 1, garcom: 'Rita' } });
    const { eventos, emDia, tipo } = await leitura;
    assert.match(String(tipo), /text\/event-stream/);
    assert.equal(emDia, true);
    assert.deepEqual(eventos.map((e) => [e.seq, e.tipo]), [[1, 'mesa-aberta'], [2, 'itens-pedidos'], [3, 'mesa-aberta']]);
  });

  it('quem reconecta com Last-Event-ID recebe só o que perdeu', async () => {
    await enviar({ id: 'garcom-0000-0005', pedido: { tipo: 'abrir-mesa', mesa: 9, pessoas: 1, garcom: 'Rita' } });
    const { eventos } = await lerEventos('/api/eventos', 2, { 'Last-Event-ID': '2' });
    assert.deepEqual(eventos.map((e) => e.seq), [3, 4]);
  });

  it('o banco guarda tudo: um livro novo no mesmo arquivo volta ao mesmo salão', () => {
    const livro = new Livro(armazenamento);
    assert.deepEqual(Object.keys(livro.salao.mesas).map(Number).sort((a, b) => a - b), [4, 8, 9]);
    assert.equal(Object.values(livro.salao.linhas)[0].nome, 'Abará');
  });

  it('responde ao healthcheck com o último evento, lendo o banco', async () => {
    const saude = await (await fetch(`${base}/saude`)).json();
    assert.deepEqual(saude, { ok: true, seq: 4 });
  });

  it('serve as telas e o domínio sem os tipos, e não deixa sair da pasta', async () => {
    const tela = await fetch(`${base}/cozinha`);
    assert.equal(tela.status, 200);
    assert.match(String(tela.headers.get('content-security-policy')), /default-src 'self'/);
    const dominio = await (await fetch(`${base}/dominio/conta.js`)).text();
    // Os tipos viram espaços, para as posições do código não mudarem.
    assert.match(dominio, /export function repartir\(total\s*, pesos\s*\)/);
    assert.doesNotMatch(dominio, /: number\[\]/);
    assert.equal((await fetch(`${base}/dominio/..%2F..%2Fpackage.js`)).status, 404);
    assert.equal((await fetch(`${base}/..%2Fpackage.json`)).status, 404);
  });
});
