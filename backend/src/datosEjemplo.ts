import { crearServicio } from './servicio.js';
import { FORMAS_PAGO, TIPOS, type Estado, type Repo } from './types.js';

const nombres = [
  'Ana María Restrepo', 'Carlos Andrés Mora', 'Luisa Fernanda Gómez', 'Jorge Iván Castaño', 'Paula Andrea Ríos',
  'Andrés Felipe Ruiz', 'Diana Marcela Ortiz', 'Julián David Pardo', 'Sandra Milena Vargas', 'Héctor Fabio Londoño',
  'Natalia Isabel Cárdenas', 'Mauricio José Henao', 'Camila Alejandra Duque', 'Oscar Eduardo Salazar', 'Valentina Rojas',
  'Fernando Arturo Méndez', 'Gloria Patricia Zapata', 'Sebastián Torres', 'Liliana Osorio', 'Ricardo Alfonso Peña',
  'Marcela Jiménez', 'Daniel Esteban Arango', 'Claudia Lorena Quintero', 'Juan Pablo Hoyos',
];
const valores = [2_500_000, 4_000_000, 6_800_000, 8_000_000, 12_000_000, 15_000_000, 18_500_000, 22_000_000, 30_000_000, 45_000_000, 60_000_000, 85_000_000];
const caminos: Estado[][] = [
  [],
  ['EN_ESTUDIO'],
  ['EN_ESTUDIO', 'APROBADO'],
  ['EN_ESTUDIO', 'APROBADO', 'DESEMBOLSADO'],
  ['EN_ESTUDIO', 'RECHAZADO'],
  ['CANCELADO'],
];

export async function cargarDatosEjemplo(repo: Repo) {
  const { total } = await repo.listar({ page: 1, pageSize: 1, sort: 'fechaSolicitud', order: 'desc' });
  if (total >= 20) return 0;

  const svc = crearServicio(repo);
  for (const [i, nombre] of nombres.entries()) {
    const c = await svc.crear(
      {
        identificacionAsociado: String(1010200300 + i * 7919),
        nombreAsociado: nombre,
        tipoCredito: TIPOS[i % TIPOS.length],
        valorSolicitado: valores[i % valores.length],
        tasaInteres: [0.9, 1.1, 1.3, 1.5, 1.8][i % 5],
        numeroCuotas: [12, 24, 36, 48, 60, 72][i % 6],
        formaPago: FORMAS_PAGO[i % FORMAS_PAGO.length],
      },
      'admin',
    );
    for (const estado of caminos[i % caminos.length]) {
      await svc.cambiarEstado(c.id, estado, 'analista', estado === 'RECHAZADO' ? 'No cumple la capacidad de pago' : undefined);
    }
  }
  return nombres.length;
}
