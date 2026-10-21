export const ESTADOS = ['SOLICITADO', 'EN_ESTUDIO', 'APROBADO', 'RECHAZADO', 'DESEMBOLSADO', 'CANCELADO'] as const;
export const TIPOS = ['LIBRE_INVERSION', 'VIVIENDA', 'VEHICULO', 'EDUCACION', 'CALAMIDAD'] as const;
export const FORMAS_PAGO = ['NOMINA', 'CAJA', 'DEBITO_AUTOMATICO'] as const;

export type Estado = (typeof ESTADOS)[number];
export type TipoCredito = (typeof TIPOS)[number];
export type FormaPago = (typeof FORMAS_PAGO)[number];
export type Rol = 'ADMIN' | 'ANALISTA';

export interface Credito {
  id: number;
  numeroCredito: string;
  identificacionAsociado: string;
  nombreAsociado: string;
  tipoCredito: TipoCredito;
  valorSolicitado: number;
  tasaInteres: number;
  numeroCuotas: number;
  formaPago: FormaPago;
  estado: Estado;
  fechaSolicitud: string;
  fechaActualizacion: string;
}

export type NuevoCredito = Pick<
  Credito,
  'identificacionAsociado' | 'nombreAsociado' | 'tipoCredito' | 'valorSolicitado' | 'tasaInteres' | 'numeroCuotas' | 'formaPago'
>;

export type CambiosCredito = Partial<Pick<Credito, 'tipoCredito' | 'valorSolicitado' | 'tasaInteres' | 'numeroCuotas' | 'formaPago'>>;

export interface Historial {
  id: number;
  creditoId: number;
  estadoAnterior: Estado | null;
  estadoNuevo: Estado;
  usuario: string;
  observacion: string | null;
  fecha: string;
}

export interface EventoWebhook {
  id: number;
  eventId: string;
  creditoId: number;
  evento: string;
  payload: string;
  estado: 'PENDIENTE' | 'ENVIADO' | 'FALLIDO';
  intentos: number;
  ultimoCodigoHttp: number | null;
  ultimoError: string | null;
  fechaCreacion: string;
  fechaEnvio: string | null;
}

export interface Usuario {
  id: number;
  username: string;
  passwordHash: string;
  rol: Rol;
}

export interface Filtros {
  page: number;
  pageSize: number;
  estado?: Estado;
  identificacion?: string;
  q?: string;
  sort: 'fechaSolicitud' | 'valorSolicitado' | 'numeroCredito' | 'estado';
  order: 'asc' | 'desc';
}

export interface Repo {
  ping(): Promise<void>;
  existeActivo(identificacion: string, tipo: TipoCredito): Promise<boolean>;
  crear(data: NuevoCredito, usuario: string, armarEvento: (c: Credito) => { eventId: string; evento: string; payload: object }): Promise<Credito>;
  listar(f: Filtros): Promise<{ items: Credito[]; total: number }>;
  obtener(id: number): Promise<Credito | null>;
  historial(id: number): Promise<Historial[]>;
  actualizar(id: number, cambios: CambiosCredito, usuario: string, observacion: string): Promise<Credito>;
  cambiarEstado(id: number, anterior: Estado, nuevo: Estado, usuario: string, observacion: string | null): Promise<Credito | null>;
  eliminar(id: number, usuario: string): Promise<void>;
  resumen(): Promise<Record<Estado, number>>;
  eventosPendientes(): Promise<EventoWebhook[]>;
  eventosDeCredito(creditoId: number): Promise<EventoWebhook[]>;
  registrarIntento(id: number, r: { ok: boolean; codigoHttp?: number; error?: string; reintentarEnSeg?: number }): Promise<void>;
  buscarUsuario(username: string): Promise<Usuario | null>;
  crearUsuario(u: Omit<Usuario, 'id'>): Promise<boolean>;
  sembrarUsuario(u: Omit<Usuario, 'id'>): Promise<void>;
}
