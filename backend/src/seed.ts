import { config } from './config.js';
import { cargarDatosEjemplo } from './datosEjemplo.js';
import { crearRepoSql } from './repo.sql.js';

const creados = await cargarDatosEjemplo(await crearRepoSql(config.db));
console.log(creados ? `${creados} créditos de ejemplo creados` : 'Ya hay 20 créditos o más, no se cargan datos de ejemplo');
process.exit(0);
