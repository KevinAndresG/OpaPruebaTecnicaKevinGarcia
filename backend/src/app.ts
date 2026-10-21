import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { z, ZodError } from 'zod';
import { config } from './config.js';
import { AppError, ok } from './errors.js';
import { openapi } from './openapi.js';
import { crearRutas } from './rutas.js';
import { crearServicio } from './servicio.js';
import { firmaValida } from './webhook.js';
import type { Repo, Rol } from './types.js';


export function createApp(repo: Repo, opts: { onCreado?: () => void } = {}) {
  const app = express();

  // swagger va antes de helmet para que su CSP no lo bloquee
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapi, { customSiteTitle: 'API Créditos' }));

  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: '100kb', verify: (req, _res, buf) => ((req as any).rawBody = buf) }));

  app.get('/api/health', async (_req, res) => {
    await repo.ping();
    res.json(ok({ status: 'ok' }));
  });

  const limiteLogin = rateLimit({
    windowMs: 60_000,
    limit: 10,
    handler: (_req, res) => res.status(429).json({ success: false, error: { code: 'DEMASIADOS_INTENTOS', message: 'Demasiados intentos, espere un minuto' } }),
  });
  const loginSchema = z.object({ username: z.string().trim().toLowerCase().min(1), password: z.string().min(1) });
  const registroSchema = z
    .object({
      username: z
        .string()
        .trim()
        .toLowerCase()
        .regex(/^[a-z0-9._]{4,30}$/, 'Entre 4 y 30 caracteres: letras, números, punto o guion bajo'),
      password: z
        .string()
        .min(8, 'Mínimo 8 caracteres')
        .max(72, 'Máximo 72 caracteres')
        .regex(/[A-Z]/, 'Debe tener al menos una mayúscula')
        .regex(/[a-z]/, 'Debe tener al menos una minúscula')
        .regex(/\d/, 'Debe tener al menos un número')
        .regex(/[^A-Za-z0-9]/, 'Debe tener al menos un símbolo'),
    })
    .strict();

  const sesion = (username: string, rol: Rol) => ({
    token: jwt.sign({ sub: username, rol }, config.jwtSecret, { expiresIn: config.jwtExpira as any }),
    usuario: { username, rol },
  });

  app.post('/api/auth/login', limiteLogin, async (req, res) => {
    const { username, password } = loginSchema.parse(req.body);
    const u = await repo.buscarUsuario(username);
    if (!u || !(await bcrypt.compare(password, u.passwordHash))) throw new AppError(401, 'CREDENCIALES_INVALIDAS', 'Usuario o contraseña incorrectos');
    res.json(ok(sesion(u.username, u.rol)));
  });

  // el registro público siempre crea analistas; un admin solo se crea desde el servidor
  app.post('/api/auth/registro', limiteLogin, async (req, res) => {
    const { username, password } = registroSchema.parse(req.body);
    const creado = await repo.crearUsuario({ username, passwordHash: await bcrypt.hash(password, 10), rol: 'ANALISTA' });
    if (!creado) throw new AppError(409, 'USUARIO_EXISTE', 'Ese nombre de usuario ya está en uso');
    res.status(201).json(ok(sesion(username, 'ANALISTA')));
  });

  app.post('/api/webhooks/creditos', (req, res) => {
    if (!firmaValida((req as any).rawBody ?? Buffer.alloc(0), req.header('X-Signature'))) {
      throw new AppError(401, 'FIRMA_INVALIDA', 'Firma del webhook inválida');
    }
    console.log('[webhook recibido]', req.body?.event, req.body?.data?.numeroCredito);
    res.json(ok({ recibido: true }));
  });

  app.use('/api', (req, res, next) => {
    const token = req.header('Authorization')?.replace(/^Bearer /, '');
    if (!token) throw new AppError(401, 'NO_AUTENTICADO', 'Debe iniciar sesión');
    try {
      const p = jwt.verify(token, config.jwtSecret) as { sub: string; rol: Rol };
      res.locals.usuario = { username: p.sub, rol: p.rol };
      next();
    } catch {
      throw new AppError(401, 'TOKEN_INVALIDO', 'La sesión expiró o el token no es válido');
    }
  });

  app.use('/api/creditos', crearRutas(crearServicio(repo), opts.onCreado));

  app.use((_req, _res, next) => next(new AppError(404, 'RUTA_NO_ENCONTRADA', 'La ruta no existe')));

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AppError) {
      return res.status(err.status).json({ success: false, error: { code: err.code, message: err.message, details: err.details } });
    }
    if (err instanceof ZodError) {
      const details = err.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message }));
      return res.status(422).json({ success: false, error: { code: 'VALIDACION', message: 'Hay datos inválidos', details } });
    }
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ success: false, error: { code: 'JSON_INVALIDO', message: 'El cuerpo no es un JSON válido' } });
    }
    console.error(err);
    res.status(500).json({ success: false, error: { code: 'ERROR_INTERNO', message: 'Ocurrió un error inesperado' } });
  });

  return app;
}

export { bcrypt };
