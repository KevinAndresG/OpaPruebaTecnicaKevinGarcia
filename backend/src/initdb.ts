import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sql from 'mssql';
import { config } from './config.js';

const script = readFileSync(join(import.meta.dirname, '..', 'sql', 'schema.sql'), 'utf8');
const lotes = script.split(/^GO\s*$/m).map((s) => s.trim()).filter(Boolean);

for (let intento = 1; ; intento++) {
  try {
    // max:1 para que el USE aplique a todos los lotes
    const pool = await new sql.ConnectionPool({ ...config.db, database: 'master', pool: { max: 1 } }).connect();
    for (const lote of lotes) await pool.request().batch(lote);
    await pool.close();
    console.log('Base de datos lista');
    break;
  } catch (e: any) {
    if (intento >= 30) throw e;
    console.log(`SQL Server no responde (${e.message}), reintento ${intento}/30...`);
    await new Promise((r) => setTimeout(r, 2000));
  }
}
