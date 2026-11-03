// O servidor do salão, só com o que vem no Node: node:http, node:sqlite e Server-Sent Events.
//
//   GET  /garcom /cozinha /bar /caixa   as telas
//   POST /api/comandos                  um comando { id, pedido }; o mesmo id não executa duas vezes
//   GET  /api/eventos                   SSE: os eventos desde ?desde= (ou Last-Event-ID) e os novos, ao vivo
//   GET  /dominio/*.js                  o domínio em TypeScript, sem os tipos, para as telas usarem o mesmo código

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Comando } from '../dominio/comandos.ts';
import type { Livro } from '../dominio/livro.ts';
import type { Evento } from '../dominio/salao.ts';

const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
const PUBLICO = join(RAIZ, 'public');
const DOMINIO = join(RAIZ, 'src', 'dominio');
const LIMITE_DO_CORPO = 64 * 1024;
const BATIDA_MS = 15_000;

const TELAS: Record<string, string> = { '/garcom': 'garcom.html', '/cozinha': 'estacao.html', '/bar': 'estacao.html', '/caixa': 'caixa.html' };
const TIPOS: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const SEGURANCA = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; style-src 'self' https://cdn.jsdelivr.net; font-src https://cdn.jsdelivr.net; img-src 'self' data:",
};

function responder(res: ServerResponse, status: number, corpo: string | Buffer, tipo: string, extras: Record<string, string> = {}) {
  res.writeHead(status, { 'Content-Type': tipo, ...SEGURANCA, ...extras });
  res.end(corpo);
}
const json = (res: ServerResponse, status: number, dados: unknown) => responder(res, status, JSON.stringify(dados), 'application/json; charset=utf-8', { 'Cache-Control': 'no-store' });

async function lerCorpo(req: IncomingMessage): Promise<string | null> {
  let tamanho = 0;
  const partes: Buffer[] = [];
  for await (const parte of req) {
    tamanho += (parte as Buffer).length;
    if (tamanho > LIMITE_DO_CORPO) return null;
    partes.push(parte as Buffer);
  }
  return Buffer.concat(partes).toString('utf8');
}

/** Caminho dentro da pasta, ou null se tentar sair dela. */
function dentroDe(pasta: string, relativo: string): string | null {
  const caminho = normalize(join(pasta, relativo));
  return caminho.startsWith(pasta.endsWith(sep) ? pasta : pasta + sep) ? caminho : null;
}

export function criarServidor(livro: Livro, relogio: () => Date = () => new Date()): Server {
  const dominioJs = new Map<string, string>();

  async function arquivo(res: ServerResponse, caminho: string | null) {
    if (!caminho) return responder(res, 404, 'Não encontrado', 'text/plain; charset=utf-8');
    try {
      responder(res, 200, await readFile(caminho), TIPOS[extname(caminho)] ?? 'application/octet-stream', { 'Cache-Control': 'no-cache' });
    } catch {
      responder(res, 404, 'Não encontrado', 'text/plain; charset=utf-8');
    }
  }

  async function dominio(res: ServerResponse, nome: string) {
    const fonte = /^[a-z-]+\.js$/.test(nome) ? dentroDe(DOMINIO, nome.replace(/\.js$/, '.ts')) : null;
    if (!fonte) return responder(res, 404, 'Não encontrado', 'text/plain; charset=utf-8');
    try {
      if (!dominioJs.has(nome)) {
        const ts = await readFile(fonte, 'utf8');
        dominioJs.set(nome, stripTypeScriptTypes(ts, { mode: 'strip' }).replace(/(from\s+'[^']+)\.ts'/g, "$1.js'"));
      }
      responder(res, 200, dominioJs.get(nome)!, TIPOS['.js'], { 'Cache-Control': 'no-cache' });
    } catch {
      responder(res, 404, 'Não encontrado', 'text/plain; charset=utf-8');
    }
  }

  async function comandos(req: IncomingMessage, res: ServerResponse) {
    const corpo = await lerCorpo(req);
    if (corpo === null) return json(res, 413, { ok: false, erro: 'Pedido grande demais.' });
    let comando: Comando;
    try {
      comando = JSON.parse(corpo);
    } catch {
      return json(res, 400, { ok: false, erro: 'JSON inválido.' });
    }
    const resultado = livro.executar(comando, relogio());
    json(res, resultado.ok ? 200 : 422, resultado);
  }

  function eventos(req: IncomingMessage, res: ServerResponse, url: URL) {
    // Quem reconecta diz o último evento que viu; o EventSource manda Last-Event-ID sozinho.
    const desde = Number(req.headers['last-event-id'] ?? url.searchParams.get('desde') ?? 0) || 0;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      ...SEGURANCA,
    });
    const mandar = (lista: Evento[]) => {
      for (const evento of lista) res.write(`id: ${evento.seq}\nevent: evento\ndata: ${JSON.stringify(evento)}\n\n`);
    };
    res.write('retry: 2000\n\n');
    mandar(livro.eventosDesde(desde));
    // Avisa que o passado acabou: a tela pode tirar o "carregando".
    res.write(`event: em-dia\ndata: ${livro.salao.seq}\n\n`);
    const parar = livro.ouvir(mandar);
    // Sem tráfego, proxies e roteadores derrubam a conexão: um comentário de tempos em tempos a mantém viva.
    const batida = setInterval(() => res.write(': batida\n\n'), BATIDA_MS);
    req.on('close', () => {
      clearInterval(batida);
      parar();
    });
  }

  return createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://salao');
    const { pathname } = url;
    try {
      if (req.method === 'POST' && pathname === '/api/comandos') return await comandos(req, res);
      if (req.method === 'GET' && pathname === '/api/eventos') return eventos(req, res, url);
      if (req.method !== 'GET') return responder(res, 405, 'Método não permitido', 'text/plain; charset=utf-8');
      if (pathname === '/') return responder(res, 302, '', 'text/plain', { Location: '/garcom' });
      if (TELAS[pathname]) return await arquivo(res, join(PUBLICO, TELAS[pathname]));
      if (pathname.startsWith('/dominio/')) return await dominio(res, pathname.slice('/dominio/'.length));
      return await arquivo(res, dentroDe(PUBLICO, decodeURIComponent(pathname)));
    } catch (erro) {
      console.error(pathname, erro);
      if (!res.headersSent) json(res, 500, { ok: false, erro: 'Erro interno.' });
    }
  });
}
