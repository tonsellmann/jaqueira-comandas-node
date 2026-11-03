// Gera a demonstração estática do portfólio: as telas de public/, o domínio de src/dominio sem os
// tipos (o mesmo que o servidor entrega em /dominio/) e a página da demonstração, que faz o papel
// do servidor no navegador.
//
//   node scripts/preparar-demonstracao.mjs ../Portfolio/public/demos/jaqueira-comandas
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const destino = process.argv[2];
if (!destino) {
  console.error('Uso: node scripts/preparar-demonstracao.mjs <pasta de destino>');
  process.exit(1);
}
const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const pasta = resolve(destino);

await rm(pasta, { recursive: true, force: true });
await cp(join(RAIZ, 'public'), pasta, { recursive: true });
await mkdir(join(pasta, 'dominio'), { recursive: true });
for (const arquivo of await readdir(join(RAIZ, 'src', 'dominio'))) {
  if (!arquivo.endsWith('.ts')) continue;
  const ts = await readFile(join(RAIZ, 'src', 'dominio', arquivo), 'utf8');
  const js = stripTypeScriptTypes(ts, { mode: 'strip' }).replace(/(from\s+'[^']+)\.ts'/g, "$1.js'");
  await writeFile(join(pasta, 'dominio', arquivo.replace(/\.ts$/, '.js')), js);
}
for (const arquivo of ['index.html', 'demo.js']) await cp(join(RAIZ, 'demo', arquivo), join(pasta, arquivo));
console.log(`Demonstração em ${pasta}`);
