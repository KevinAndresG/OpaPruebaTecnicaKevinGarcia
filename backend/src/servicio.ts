import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AppError, notFound } from './errors.js';
import { ESTADOS, FORMAS_PAGO, TIPOS, type CambiosCredito, type Credito, type Estado, type Filtros, type NuevoCredito, type Repo } from './types.js';

export const TRANSICIONES: Record<Estado, Estado[]> = {
  SOLICITADO: ['EN_ESTUDIO', 'CANCELADO'],
  EN_ESTUDIO: ['APROBADO', 'RECHAZADO', 'CANCELADO'],
  APROBADO: ['DESEMBOLSADO', 'CANCELADO'],
  RECHAZADO: [],
  DESEMBOLSADO: [],
  CANCELADO: [],
};

const EDITABLES: Estado[] = ['SOLICITADO', 'EN_ESTUDIO'];
const ETIQUETA = { tipoCredito: 'Tipo', valorSolicitado: 'Valor', tasaInteres: 'Tasa', numeroCuotas: 'Cuotas', formaPago: 'Forma de pago' };

const valor = z.number({ error: 'Debe ser un número' }).positive('Debe ser mayor a 0').max(9_999_999_999_999, 'Valor demasiado alto');
const tasa = z.number({ error: 'Debe ser un número' }).min(0, 'No puede ser negativa').max(100, 'No puede superar 100');
const cuotas = z.number({ error: 'Debe ser un número' }).int('Debe ser entero').positive('Debe ser mayor a 0').max(360, 'Máximo 360 cuotas');

export const crearSchema = z.object({
  identificacionAsociado: z.string().regex(/^\d{5,15}$/, 'Solo números, entre 5 y 15 dígitos'),
  nombreAsociado: z.string().trim().min(3, 'Mínimo 3 caracteres').max(150),
  tipoCredito: z.enum(TIPOS),
  valorSolicitado: valor,
  tasaInteres: tasa,
  numeroCuotas: cuotas,
  formaPago: z.enum(FORMAS_PAGO),
});

export const actualizarSchema = z
  .object({
    tipoCredito: z.enum(TIPOS),
    valorSolicitado: valor,
    tasaInteres: tasa,
    numeroCuotas: cuotas,
    formaPago: z.enum(FORMAS_PAGO),
  })
  .partial()
  .strict()
  .refine((o) => Object.keys(o).length > 0, 'Envíe al menos un campo para actualizar');

export const estadoSchema = z.object({
  estado: z.enum(ESTADOS),
  observacion: z.string().trim().max(500).optional(),
});

export const filtrosSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  estado: z.enum(ESTADOS).optional(),
  identificacion: z.string().regex(/^\d{1,15}$/).optional(),
  q: z.string().trim().max(100).optional(),
  sort: z.enum(['fechaSolicitud', 'valorSolicitado', 'numeroCredito', 'estado']).default('fechaSolicitud'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export function crearServicio(repo: Repo) {
  const requerir = async (id: number) => (await repo.obtener(id)) ?? Promise.reject(notFound());

  return {
    async crear(data: NuevoCredito, usuario: string) {
      if (await repo.existeActivo(data.identificacionAsociado, data.tipoCredito)) {
        throw new AppError(409, 'CREDITO_DUPLICADO', 'El asociado ya tiene un crédito activo de este tipo');
      }
      // el evento queda en la misma transacción que el crédito
      return repo.crear(data, usuario, (c: Credito) => {
        const eventId = randomUUID();
        return {
          eventId,
          evento: 'credito.creado',
          payload: {
            event: 'credito.creado',
            eventId,
            timestamp: new Date().toISOString(),
            data: {
              id: c.id,
              numeroCredito: c.numeroCredito,
              identificacionAsociado: c.identificacionAsociado,
              valorSolicitado: c.valorSolicitado,
              estado: c.estado,
            },
          },
        };
      });
    },

    listar: (f: Filtros) => repo.listar(f),
    resumen: () => repo.resumen(),

    async detalle(id: number) {
      const credito = await requerir(id);
      return { ...credito, historial: await repo.historial(id), webhooks: await repo.eventosDeCredito(id) };
    },

    async actualizar(id: number, cambios: CambiosCredito, usuario: string) {
      const actual = await requerir(id);
      if (!EDITABLES.includes(actual.estado)) {
        throw new AppError(422, 'CREDITO_NO_EDITABLE', `No se puede editar un crédito en estado ${actual.estado}`);
      }
      const diff = (Object.keys(cambios) as (keyof CambiosCredito)[])
        .filter((k) => cambios[k] !== actual[k])
        .map((k) => `${ETIQUETA[k]}: ${actual[k]} → ${cambios[k]}`);
      if (!diff.length) return actual;
      return repo.actualizar(id, cambios, usuario, `Edición. ${diff.join('; ')}`.slice(0, 500));
    },

    async cambiarEstado(id: number, nuevo: Estado, usuario: string, observacion?: string) {
      const actual = await requerir(id);
      if (!TRANSICIONES[actual.estado].includes(nuevo)) {
        throw new AppError(422, 'TRANSICION_INVALIDA', `No se puede pasar de ${actual.estado} a ${nuevo}`, {
          permitidas: TRANSICIONES[actual.estado],
        });
      }
      if (nuevo === 'RECHAZADO' && !observacion) {
        throw new AppError(422, 'OBSERVACION_REQUERIDA', 'Para rechazar un crédito debe indicar el motivo');
      }
      const c = await repo.cambiarEstado(id, actual.estado, nuevo, usuario, observacion ?? null);
      if (!c) throw new AppError(409, 'CONFLICTO_ESTADO', 'El crédito cambió de estado mientras lo procesaba, intente de nuevo');
      return c;
    },

    async eliminar(id: number, usuario: string) {
      const actual = await requerir(id);
      if (actual.estado === 'DESEMBOLSADO') {
        throw new AppError(422, 'CREDITO_NO_ELIMINABLE', 'Un crédito desembolsado no se puede eliminar');
      }
      await repo.eliminar(id, usuario);
    },
  };
}

export type Servicio = ReturnType<typeof crearServicio>;
