import { Router, type Request, type Response, type NextFunction } from 'express';
import { AppError, ok } from './errors.js';
import { actualizarSchema, crearSchema, estadoSchema, filtrosSchema, type Servicio } from './servicio.js';
import type { Rol } from './types.js';

const usuario = (res: Response) => res.locals.usuario.username as string;

const soloRol = (rol: Rol) => (_req: Request, res: Response, next: NextFunction) => {
  if (res.locals.usuario.rol !== rol) throw new AppError(403, 'SIN_PERMISO', 'No tiene permiso para esta acción');
  next();
};

function idDe(req: Request) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) throw new AppError(400, 'ID_INVALIDO', 'El id debe ser un número entero positivo');
  return id;
}

export function crearRutas(svc: Servicio, onCreado?: () => void) {
  const r = Router();

  r.post('/', async (req, res) => {
    const credito = await svc.crear(crearSchema.parse(req.body), usuario(res));
    onCreado?.();
    res.status(201).json(ok(credito));
  });

  r.get('/', async (req, res) => {
    const f = filtrosSchema.parse(req.query);
    const { items, total } = await svc.listar(f);
    res.json(ok(items, { page: f.page, pageSize: f.pageSize, total, totalPages: Math.max(1, Math.ceil(total / f.pageSize)) }));
  });

  // antes de /:id
  r.get('/resumen', async (_req, res) => {
    const porEstado = await svc.resumen();
    res.json(ok({ total: Object.values(porEstado).reduce((a, b) => a + b, 0), porEstado }));
  });

  r.get('/:id', async (req, res) => res.json(ok(await svc.detalle(idDe(req)))));

  const actualizar = async (req: Request, res: Response) =>
    res.json(ok(await svc.actualizar(idDe(req), actualizarSchema.parse(req.body), usuario(res))));
  r.put('/:id', actualizar);
  r.patch('/:id', actualizar);

  r.patch('/:id/estado', async (req, res) => {
    const { estado, observacion } = estadoSchema.parse(req.body);
    res.json(ok(await svc.cambiarEstado(idDe(req), estado, usuario(res), observacion)));
  });

  r.delete('/:id', soloRol('ADMIN'), async (req, res) => {
    await svc.eliminar(idDe(req), usuario(res));
    res.json(ok({ eliminado: true }));
  });

  return r;
}
