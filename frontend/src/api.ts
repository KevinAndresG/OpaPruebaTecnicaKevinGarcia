export const ESTADOS = ['SOLICITADO', 'EN_ESTUDIO', 'APROBADO', 'RECHAZADO', 'DESEMBOLSADO', 'CANCELADO'] as const
export type Estado = (typeof ESTADOS)[number]

export const EDITABLES: Estado[] = ['SOLICITADO', 'EN_ESTUDIO']

export const TIPOS: Record<string, string> = {
  LIBRE_INVERSION: 'Libre inversión',
  VIVIENDA: 'Vivienda',
  VEHICULO: 'Vehículo',
  EDUCACION: 'Educación',
  CALAMIDAD: 'Calamidad',
}
export const FORMAS_PAGO: Record<string, string> = { NOMINA: 'Nómina', CAJA: 'Caja', DEBITO_AUTOMATICO: 'Débito automático' }

export const TRANSICIONES: Record<Estado, Estado[]> = {
  SOLICITADO: ['EN_ESTUDIO', 'CANCELADO'],
  EN_ESTUDIO: ['APROBADO', 'RECHAZADO', 'CANCELADO'],
  APROBADO: ['DESEMBOLSADO', 'CANCELADO'],
  RECHAZADO: [],
  DESEMBOLSADO: [],
  CANCELADO: [],
}

export interface Credito {
  id: number
  numeroCredito: string
  identificacionAsociado: string
  nombreAsociado: string
  tipoCredito: string
  valorSolicitado: number
  tasaInteres: number
  numeroCuotas: number
  formaPago: string
  estado: Estado
  fechaSolicitud: string
  fechaActualizacion: string
}
export interface Historial { id: number; estadoAnterior: Estado | null; estadoNuevo: Estado; usuario: string; observacion: string | null; fecha: string }
export interface EventoWebhook { id: number; eventId: string; estado: 'PENDIENTE' | 'ENVIADO' | 'FALLIDO'; intentos: number; ultimoCodigoHttp: number | null; ultimoError: string | null; fechaCreacion: string; fechaEnvio: string | null }
export interface Detalle extends Credito { historial: Historial[]; webhooks: EventoWebhook[] }
export interface Meta { page: number; pageSize: number; total: number; totalPages: number }

export class ApiError extends Error {
  status: number
  code: string
  details?: { campo: string; mensaje: string }[]
  constructor(status: number, code: string, message: string, details?: { campo: string; mensaje: string }[]) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

export const sesion = {
  token: () => localStorage.getItem('token'),
  usuario: (): { username: string; rol: 'ADMIN' | 'ANALISTA' } | null => JSON.parse(localStorage.getItem('usuario') ?? 'null'),
  guardar(token: string, usuario: unknown) {
    localStorage.setItem('token', token)
    localStorage.setItem('usuario', JSON.stringify(usuario))
  },
  cerrar() {
    localStorage.removeItem('token')
    localStorage.removeItem('usuario')
  },
}

async function llamar<T>(ruta: string, init: RequestInit = {}): Promise<{ data: T; meta?: Meta }> {
  let res: Response
  try {
    res = await fetch(`/api${ruta}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(sesion.token() && { Authorization: `Bearer ${sesion.token()}` }) },
    })
  } catch {
    throw new ApiError(0, 'SIN_CONEXION', 'No se pudo conectar con el servidor. Revise su conexión e intente de nuevo.')
  }
  const json = await res.json().catch(() => null)
  if (!res.ok) {
    if (res.status === 401 && !ruta.startsWith('/auth')) {
      sesion.cerrar()
      location.assign('/login')
    }
    const e = json?.error
    throw new ApiError(res.status, e?.code ?? 'ERROR', e?.message ?? 'Ocurrió un error inesperado', Array.isArray(e?.details) ? e.details : undefined)
  }
  return json
}

const enviar = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) })

export const api = {
  login: (username: string, password: string) =>
    llamar<{ token: string; usuario: { username: string; rol: string } }>('/auth/login', enviar('POST', { username, password })).then((r) => r.data),
  registro: (username: string, password: string) =>
    llamar<{ token: string; usuario: { username: string; rol: string } }>('/auth/registro', enviar('POST', { username, password })).then((r) => r.data),
  resumen: () => llamar<{ total: number; porEstado: Record<Estado, number> }>('/creditos/resumen').then((r) => r.data),
  listar: (params: URLSearchParams) => llamar<Credito[]>(`/creditos?${params}`),
  detalle: (id: string) => llamar<Detalle>(`/creditos/${id}`).then((r) => r.data),
  crear: (body: unknown) => llamar<Credito>('/creditos', enviar('POST', body)).then((r) => r.data),
  editar: (id: number, cambios: Record<string, string | number>) => llamar<Credito>(`/creditos/${id}`, enviar('PATCH', cambios)).then((r) => r.data),
  cambiarEstado: (id: number, estado: Estado, observacion?: string) =>
    llamar<Credito>(`/creditos/${id}/estado`, enviar('PATCH', { estado, observacion: observacion || undefined })).then((r) => r.data),
  eliminar: (id: number) => llamar(`/creditos/${id}`, enviar('DELETE')),
}
