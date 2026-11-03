// Liga o salão: npm start (porta 3000, banco em dados/salao.db).
//   PORTA=8080 BANCO=/caminho/salao.db npm start

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Livro } from '../dominio/livro.ts';
import { criarServidor } from './app.ts';
import { armazenamentoSqlite } from './armazenamento-sqlite.ts';

const porta = Number(process.env.PORTA ?? 3000);
// Por padrão, o banco fica em dados/, dentro do projeto, de onde quer que o comando seja chamado.
const banco = process.env.BANCO ?? fileURLToPath(new URL('../../dados/salao.db', import.meta.url));
if (banco !== ':memory:') mkdirSync(dirname(banco), { recursive: true });

const armazenamento = armazenamentoSqlite(banco);
const livro = new Livro(armazenamento);
const servidor = criarServidor(livro);

servidor.listen(porta, () => {
  console.log(`Salão no ar: http://localhost:${porta}/garcom  (cozinha, bar e caixa em /cozinha, /bar e /caixa)`);
});

for (const sinal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sinal, () => {
    servidor.close();
    servidor.closeAllConnections();
    armazenamento.fechar();
    process.exit(0);
  });
}
