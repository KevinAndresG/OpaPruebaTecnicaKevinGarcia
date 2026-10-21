import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';
import { cargarDatosEjemplo } from '../src/datosEjemplo.js';
import { crearRepoMemoria } from '../src/repo.memoria.js';
import { despachar } from '../src/webhook.js';

const nuevo = {
  identificacionAsociado: '1001234567',
  nombreAsociado: 'Juan Perez',
  tipoCredito: 'LIBRE_INVERSION',
  valorSolicitado: 15000000,
  tasaInteres: 1.5,
  numeroCuotas: 36,
  formaPago: 'NOMINA',
};

let repo: ReturnType<typeof crearRepoMemoria>;
let api: ReturnType<typeof request>;
let token: string;
let tokenAnalista: string;

const login = async (username: string, password: string) =>
  (await api.post('/api/auth/login').send({ username, password })).body.data?.token as string;
const auth = (t = token) => ({ Authorization: `Bearer ${t}` });
const crear = (extra = {}) => api.post('/api/creditos').set(auth()).send({ ...nuevo, ...extra });

beforeEach(async () => {
  repo = crearRepoMemoria();
  await repo.sembrarUsuario({ username: 'admin', passwordHash: await bcrypt.hash('clave', 4), rol: 'ADMIN' });
  await repo.sembrarUsuario({ username: 'analista', passwordHash: await bcrypt.hash('clave', 4), rol: 'ANALISTA' });
  api = request(createApp(repo));
  token = await login('admin', 'clave');
  tokenAnalista = await login('analista', 'clave');
});

describe('seguridad', () => {
  it('rechaza sin token (401)', async () => {
    const r = await api.get('/api/creditos');
    expect(r.status).toBe(401);
    expect(r.body).toEqual({ success: false, error: expect.objectContaining({ code: 'NO_AUTENTICADO' }) });
  });

  it('rechaza clave incorrecta (401)', async () => {
    const r = await api.post('/api/auth/login').send({ username: 'admin', password: 'mala' });
    expect(r.status).toBe(401);
  });

  it('solo ADMIN puede eliminar (403)', async () => {
    const { body } = await crear();
    const r = await api.delete(`/api/creditos/${body.data.id}`).set(auth(tokenAnalista));
    expect(r.status).toBe(403);
  });
});

describe('datos de ejemplo', () => {
  it('crea 24 créditos en varios estados y no se repite', async () => {
    expect(await cargarDatosEjemplo(repo)).toBe(24);
    const r = await api.get('/api/creditos/resumen').set(auth());
    expect(r.body.data.total).toBe(24);
    expect(Object.values(r.body.data.porEstado).every((n) => (n as number) > 0)).toBe(true);
    expect(await cargarDatosEjemplo(repo)).toBe(0);
  });
});

describe('registro de usuarios', () => {
  const registrar = (body: object) => api.post('/api/auth/registro').send(body);

  it('crea un analista y devuelve un token que sirve', async () => {
    const r = await registrar({ username: 'Maria.Lopez', password: 'Clave_Segura1' });
    expect(r.status).toBe(201);
    expect(r.body.data.usuario).toEqual({ username: 'maria.lopez', rol: 'ANALISTA' });
    expect((await api.get('/api/creditos').set(auth(r.body.data.token))).status).toBe(200);
    expect(await login('maria.lopez', 'Clave_Segura1')).toBeTruthy();
  });

  it('no permite un usuario repetido (409)', async () => {
    const r = await registrar({ username: 'admin', password: 'Clave_Segura1' });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('USUARIO_EXISTE');
  });

  it.each(['corta1!', 'sinmayuscula1!', 'SINMINUSCULA1!', 'SinNumero!!', 'SinSimbolo12'])('rechaza la clave débil %s (422)', async (password) => {
    const r = await registrar({ username: 'nuevo.usuario', password });
    expect(r.status).toBe(422);
  });

  it('no deja registrarse como ADMIN', async () => {
    const r = await registrar({ username: 'intruso', password: 'Clave_Segura1', rol: 'ADMIN' });
    expect(r.status).toBe(422);
  });
});

describe('crear crédito', () => {
  it('crea en estado SOLICITADO con historial inicial y evento de webhook', async () => {
    const r = await crear();
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject({ estado: 'SOLICITADO', numeroCredito: expect.stringMatching(/^CR-\d{4}-\d{6}$/) });
    const detalle = await api.get(`/api/creditos/${r.body.data.id}`).set(auth());
    expect(detalle.body.data.historial).toHaveLength(1);
    expect(detalle.body.data.webhooks[0]).toMatchObject({ evento: 'credito.creado', estado: 'PENDIENTE' });
  });

  it.each([
    ['valor en cero', { valorSolicitado: 0 }],
    ['tasa negativa', { tasaInteres: -1 }],
    ['cuotas en cero', { numeroCuotas: 0 }],
    ['tipo desconocido', { tipoCredito: 'OTRO' }],
    ['identificación con letras', { identificacionAsociado: 'abc' }],
  ])('valida: %s (422)', async (_n, malo) => {
    const r = await crear(malo);
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('VALIDACION');
  });

  it('no permite dos créditos activos del mismo tipo para un asociado (409)', async () => {
    await crear();
    const r = await crear();
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('CREDITO_DUPLICADO');
  });
});

describe('consultas', () => {
  it('crédito inexistente responde 404 con el formato de error', async () => {
    const r = await api.get('/api/creditos/999').set(auth());
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ success: false, error: { code: 'CREDITO_NOT_FOUND', message: 'El crédito no existe' } });
  });

  it('pagina y filtra por estado', async () => {
    for (let i = 0; i < 3; i++) await crear({ identificacionAsociado: `100000000${i}` });
    const r = await api.get('/api/creditos?pageSize=2&estado=SOLICITADO').set(auth());
    expect(r.body.data).toHaveLength(2);
    expect(r.body.meta).toMatchObject({ total: 3, totalPages: 2 });
  });
});

describe('cambio de estado', () => {
  const estado = (id: number, e: string, observacion?: string) =>
    api.patch(`/api/creditos/${id}/estado`).set(auth()).send({ estado: e, observacion });

  it('sigue el flujo válido y deja historial', async () => {
    const { id } = (await crear()).body.data;
    expect((await estado(id, 'EN_ESTUDIO')).status).toBe(200);
    expect((await estado(id, 'APROBADO')).body.data.estado).toBe('APROBADO');
    const h = (await api.get(`/api/creditos/${id}`).set(auth())).body.data.historial;
    expect(h.map((x: any) => x.estadoNuevo)).toEqual(['SOLICITADO', 'EN_ESTUDIO', 'APROBADO']);
  });

  it('RECHAZADO no puede pasar a DESEMBOLSADO (422)', async () => {
    const { id } = (await crear()).body.data;
    await estado(id, 'EN_ESTUDIO');
    await estado(id, 'RECHAZADO', 'Sin capacidad de pago');
    const r = await estado(id, 'DESEMBOLSADO');
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('TRANSICION_INVALIDA');
  });

  it('rechazar exige observación', async () => {
    const { id } = (await crear()).body.data;
    await estado(id, 'EN_ESTUDIO');
    expect((await estado(id, 'RECHAZADO')).body.error.code).toBe('OBSERVACION_REQUERIDA');
  });

  it('edita un crédito en estudio y deja el cambio en el historial', async () => {
    const { id } = (await crear()).body.data;
    await estado(id, 'EN_ESTUDIO');
    const r = await api.patch(`/api/creditos/${id}`).set(auth()).send({ valorSolicitado: 18000000, numeroCuotas: 48 });
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ valorSolicitado: 18000000, numeroCuotas: 48, estado: 'EN_ESTUDIO' });
    const h = (await api.get(`/api/creditos/${id}`).set(auth())).body.data.historial;
    expect(h.at(-1).observacion).toContain('Valor: 15000000 → 18000000');
    expect(h.at(-1).observacion).toContain('Cuotas: 36 → 48');
  });

  it('editar sin cambios reales no agrega historial', async () => {
    const { id } = (await crear()).body.data;
    await api.patch(`/api/creditos/${id}`).set(auth()).send({ valorSolicitado: 15000000 });
    const h = (await api.get(`/api/creditos/${id}`).set(auth())).body.data.historial;
    expect(h).toHaveLength(1);
  });

  it('valida los valores al editar (422)', async () => {
    const { id } = (await crear()).body.data;
    expect((await api.patch(`/api/creditos/${id}`).set(auth()).send({ valorSolicitado: -5 })).status).toBe(422);
    expect((await api.patch(`/api/creditos/${id}`).set(auth()).send({})).status).toBe(422);
  });

  it('no deja editar un crédito aprobado ni cambiar campos inmutables', async () => {
    const { id } = (await crear()).body.data;
    expect((await api.put(`/api/creditos/${id}`).set(auth()).send({ numeroCredito: 'X' })).status).toBe(422);
    await estado(id, 'EN_ESTUDIO');
    await estado(id, 'APROBADO');
    const r = await api.put(`/api/creditos/${id}`).set(auth()).send({ valorSolicitado: 1 });
    expect(r.body.error.code).toBe('CREDITO_NO_EDITABLE');
  });
});

describe('webhook', () => {
  it('marca ENVIADO cuando el sistema externo responde 200 y firma el cuerpo', async () => {
    await crear();
    const fake = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    await despachar(repo, fake as any);
    expect(repo.eventos[0]).toMatchObject({ estado: 'ENVIADO', intentos: 1, ultimoCodigoHttp: 200 });
    expect(fake.mock.calls[0][1].headers['X-Signature']).toMatch(/^[a-f0-9]{64}$/);
  });

  it('si el sistema externo falla deja el evento PENDIENTE para reintentar, y tras 5 intentos FALLIDO', async () => {
    await crear();
    const caido = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    await despachar(repo, caido as any);
    expect(repo.eventos[0]).toMatchObject({ estado: 'PENDIENTE', intentos: 1, ultimoError: 'ECONNREFUSED' });
    for (let i = 0; i < 4; i++) await despachar(repo, caido as any);
    expect(repo.eventos[0]).toMatchObject({ estado: 'FALLIDO', intentos: 5 });
  });

  it('un 500 del externo también se reintenta', async () => {
    await crear();
    await despachar(repo, vi.fn().mockResolvedValue(new Response('', { status: 500 })) as any);
    expect(repo.eventos[0]).toMatchObject({ estado: 'PENDIENTE', ultimoCodigoHttp: 500 });
  });

  it('el crédito se crea aunque el webhook esté caído', async () => {
    const r = await crear();
    expect(r.status).toBe(201);
  });
});
