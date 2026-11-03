// Os eventos e os comandos já processados no SQLite que vem com o Node (node:sqlite), num arquivo
// só. O restaurante não precisa de servidor de banco: o computador do caixa basta.

import { DatabaseSync } from 'node:sqlite';
import type { Armazenamento, Resultado } from '../dominio/livro.ts';
import type { Evento } from '../dominio/salao.ts';

export function armazenamentoSqlite(caminho: string): Armazenamento & { fechar(): void } {
  const db = new DatabaseSync(caminho);
  // WAL: a leitura das telas não espera a escrita de um pedido.
  if (caminho !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS eventos (
      seq   INTEGER PRIMARY KEY AUTOINCREMENT,
      em    TEXT NOT NULL,
      fato  TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS comandos (
      id         TEXT PRIMARY KEY,
      resultado  TEXT NOT NULL,
      em         TEXT NOT NULL
    );
  `);
  const inserirEvento = db.prepare('INSERT INTO eventos (em, fato) VALUES (?, ?)');
  const inserirComando = db.prepare('INSERT INTO comandos (id, resultado, em) VALUES (?, ?, ?)');
  const buscarComando = db.prepare('SELECT resultado FROM comandos WHERE id = ?');
  const buscarEventos = db.prepare('SELECT seq, em, fato FROM eventos WHERE seq > ? ORDER BY seq');

  return {
    resultadoDe(id) {
      const linha = buscarComando.get(id) as { resultado: string } | undefined;
      return linha ? (JSON.parse(linha.resultado) as Resultado) : null;
    },

    gravar(id, fatos, em, resultado) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const eventos = fatos.map((fato) => {
          const { lastInsertRowid } = inserirEvento.run(em, JSON.stringify(fato));
          return { ...fato, seq: Number(lastInsertRowid), em } as Evento;
        });
        inserirComando.run(id, JSON.stringify(resultado(eventos)), em);
        db.exec('COMMIT');
        return eventos;
      } catch (erro) {
        db.exec('ROLLBACK');
        throw erro;
      }
    },

    eventosDesde(seq) {
      return (buscarEventos.all(seq) as Array<{ seq: number; em: string; fato: string }>).map(
        (linha) => ({ ...JSON.parse(linha.fato), seq: Number(linha.seq), em: linha.em }) as Evento,
      );
    },

    fechar: () => db.close(),
  };
}
