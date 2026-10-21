import { ESTADOS, FORMAS_PAGO, TIPOS } from './types.js';

const seguro = [{ bearerAuth: [] }];
const id = { name: 'id', in: 'path', required: true, schema: { type: 'integer' } };
const body = (ref: string) => ({ required: true, content: { 'application/json': { schema: { $ref: `#/components/schemas/${ref}` } } } });
const res = (descripcion: string, ref?: string) => ({
  description: descripcion,
  ...(ref ? { content: { 'application/json': { schema: { $ref: `#/components/schemas/${ref}` } } } } : {}),
});
const errores = {
  '401': res('No autenticado o token vencido', 'Error'),
  '404': res('El crédito no existe', 'Error'),
  '422': res('Datos inválidos o regla de negocio incumplida', 'Error'),
};

export const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'API de Créditos - OPA',
    version: '1.0.0',
    description: 'Módulo de solicitudes de crédito. Primero use **POST /api/auth/login**, copie el token y pulse **Authorize**.',
  },
  servers: [{ url: '/' }],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: { type: 'object', properties: { code: { type: 'string', example: 'CREDITO_NOT_FOUND' }, message: { type: 'string', example: 'El crédito no existe' }, details: {} } },
        },
      },
      Login: {
        type: 'object',
        required: ['username', 'password'],
        properties: { username: { type: 'string', example: 'admin' }, password: { type: 'string', example: 'Admin123*' } },
      },
      Registro: {
        type: 'object',
        required: ['username', 'password'],
        properties: { username: { type: 'string', example: 'maria.lopez' }, password: { type: 'string', example: 'Clave_Segura1' } },
      },
      Credito: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          numeroCredito: { type: 'string', example: 'CR-2026-000123' },
          identificacionAsociado: { type: 'string' },
          nombreAsociado: { type: 'string' },
          tipoCredito: { type: 'string', enum: TIPOS },
          valorSolicitado: { type: 'number', example: 15000000 },
          tasaInteres: { type: 'number', example: 1.5 },
          numeroCuotas: { type: 'integer', example: 36 },
          formaPago: { type: 'string', enum: FORMAS_PAGO },
          estado: { type: 'string', enum: ESTADOS },
          fechaSolicitud: { type: 'string', format: 'date-time' },
          fechaActualizacion: { type: 'string', format: 'date-time' },
        },
      },
      NuevoCredito: {
        type: 'object',
        required: ['identificacionAsociado', 'nombreAsociado', 'tipoCredito', 'valorSolicitado', 'tasaInteres', 'numeroCuotas', 'formaPago'],
        properties: {
          identificacionAsociado: { type: 'string', example: '1001234567' },
          nombreAsociado: { type: 'string', example: 'Juan Perez' },
          tipoCredito: { type: 'string', enum: TIPOS, example: 'LIBRE_INVERSION' },
          valorSolicitado: { type: 'number', example: 15000000 },
          tasaInteres: { type: 'number', example: 1.5 },
          numeroCuotas: { type: 'integer', example: 36 },
          formaPago: { type: 'string', enum: FORMAS_PAGO, example: 'NOMINA' },
        },
      },
      CambiosCredito: {
        type: 'object',
        description: 'Solo se pueden editar estos campos y solo en SOLICITADO o EN_ESTUDIO.',
        properties: {
          tipoCredito: { type: 'string', enum: TIPOS },
          valorSolicitado: { type: 'number' },
          tasaInteres: { type: 'number' },
          numeroCuotas: { type: 'integer' },
          formaPago: { type: 'string', enum: FORMAS_PAGO },
        },
      },
      CambioEstado: {
        type: 'object',
        required: ['estado'],
        properties: { estado: { type: 'string', enum: ESTADOS }, observacion: { type: 'string', description: 'Obligatoria al rechazar' } },
      },
    },
  },
  paths: {
    '/api/auth/login': {
      post: { tags: ['Auth'], summary: 'Iniciar sesión', requestBody: body('Login'), responses: { '200': res('Token JWT'), '401': res('Credenciales inválidas', 'Error') } },
    },
    '/api/auth/registro': {
      post: {
        tags: ['Auth'],
        summary: 'Registrar usuario (siempre con rol ANALISTA)',
        description: 'Usuario de 4 a 30 caracteres (letras, números, punto, guion bajo). Contraseña de 8 a 72 caracteres con mayúscula, minúscula, número y símbolo.',
        requestBody: body('Registro'),
        responses: { '201': res('Usuario creado, devuelve token'), '409': res('El usuario ya existe', 'Error'), '422': res('Datos inválidos', 'Error') },
      },
    },
    '/api/creditos': {
      post: {
        tags: ['Créditos'], summary: 'Crear crédito (genera el evento de webhook)', security: seguro, requestBody: body('NuevoCredito'),
        responses: { '201': res('Creado', 'Credito'), '409': res('El asociado ya tiene un crédito activo de ese tipo', 'Error'), ...errores },
      },
      get: {
        tags: ['Créditos'], summary: 'Listar con paginación, filtros, búsqueda y orden', security: seguro,
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 10, maximum: 100 } },
          { name: 'estado', in: 'query', schema: { type: 'string', enum: ESTADOS } },
          { name: 'identificacion', in: 'query', schema: { type: 'string' } },
          { name: 'q', in: 'query', description: 'Busca en nombre, número de crédito e identificación', schema: { type: 'string' } },
          { name: 'sort', in: 'query', schema: { type: 'string', enum: ['fechaSolicitud', 'valorSolicitado', 'numeroCredito', 'estado'] } },
          { name: 'order', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
        ],
        responses: { '200': res('Página de créditos'), '401': errores['401'], '422': errores['422'] },
      },
    },
    '/api/creditos/resumen': {
      get: { tags: ['Créditos'], summary: 'Total de créditos y cantidad por estado (dashboard)', security: seguro, responses: { '200': res('Resumen'), '401': errores['401'] } },
    },
    '/api/creditos/{id}': {
      get: { tags: ['Créditos'], summary: 'Detalle con historial y trazas de webhook', security: seguro, parameters: [id], responses: { '200': res('Crédito'), '404': errores['404'], '401': errores['401'] } },
      put: { tags: ['Créditos'], summary: 'Actualizar información', security: seguro, parameters: [id], requestBody: body('CambiosCredito'), responses: { '200': res('Actualizado', 'Credito'), ...errores } },
      patch: { tags: ['Créditos'], summary: 'Actualizar información (parcial)', security: seguro, parameters: [id], requestBody: body('CambiosCredito'), responses: { '200': res('Actualizado', 'Credito'), ...errores } },
      delete: { tags: ['Créditos'], summary: 'Eliminar (borrado lógico). Solo rol ADMIN', security: seguro, parameters: [id], responses: { '200': res('Eliminado'), '403': res('Sin permiso', 'Error'), ...errores } },
    },
    '/api/creditos/{id}/estado': {
      patch: {
        tags: ['Créditos'], summary: 'Cambiar estado (valida transiciones)', security: seguro, parameters: [id], requestBody: body('CambioEstado'),
        responses: { '200': res('Estado cambiado', 'Credito'), '409': res('Cambió mientras se procesaba', 'Error'), ...errores },
      },
    },
    '/api/webhooks/creditos': {
      post: { tags: ['Webhook'], summary: 'Receptor de ejemplo del webhook (valida firma HMAC en X-Signature)', responses: { '200': res('Recibido'), '401': res('Firma inválida', 'Error') } },
    },
    '/api/health': { get: { tags: ['Sistema'], summary: 'Health check (verifica la base de datos)', responses: { '200': res('OK') } } },
  },
};
