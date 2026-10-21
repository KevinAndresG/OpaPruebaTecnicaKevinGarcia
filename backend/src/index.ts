import { bcrypt, createApp } from './app.js';
import { config } from './config.js';
import { cargarDatosEjemplo } from './datosEjemplo.js';
import { crearRepoSql } from './repo.sql.js';
import { despachar } from './webhook.js';

const repo = await crearRepoSql(config.db);

await repo.sembrarUsuario({ username: 'admin', passwordHash: await bcrypt.hash(config.seed.adminPassword, 10), rol: 'ADMIN' });
await repo.sembrarUsuario({ username: 'analista', passwordHash: await bcrypt.hash(config.seed.analistaPassword, 10), rol: 'ANALISTA' });
if (config.seed.datosEjemplo) await cargarDatosEjemplo(repo);

let enviando = false;
const enviar = async () => {
  if (enviando) return;
  enviando = true;
  try {
    await despachar(repo);
  } catch (e) {
    console.error('[webhook]', e instanceof Error ? e.message : e);
  } finally {
    enviando = false;
  }
};

// con varias instancias habría que bloquear filas para no enviar dos veces
setInterval(enviar, 15_000);

createApp(repo, { onCreado: enviar }).listen(config.port, () => console.log(`API lista en http://localhost:${config.port}  (docs: /api/docs)`));
