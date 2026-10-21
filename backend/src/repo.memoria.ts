import { AppError } from './errors.js';
import { ESTADOS, type Credito, type Estado, type EventoWebhook, type Historial, type Repo, type Usuario } from './types.js';

const VIVOS: Estado[] = ['SOLICITADO', 'EN_ESTUDIO', 'APROBADO'];

export function crearRepoMemoria(): Repo & { eventos: EventoWebhook[] } {
  const creditos: (Credito & { eliminado?: boolean })[] = [];
  const hist: Historial[] = [];
  const eventos: EventoWebhook[] = [];
  const usuarios: Usuario[] = [];
  const ahora = () => new Date().toISOString();
  const addHist = (creditoId: number, estadoAnterior: Estado | null, estadoNuevo: Estado, usuario: string, observacion: string | null) =>
    hist.push({ id: hist.length + 1, creditoId, estadoAnterior, estadoNuevo, usuario, observacion, fecha: ahora() });
  const vivo = (id: number) => creditos.find((c) => c.id === id && !c.eliminado);

  const repo: Repo & { eventos: EventoWebhook[] } = {
    eventos,
    ping: async () => {},
    existeActivo: async (ident, tipo) =>
      creditos.some((c) => !c.eliminado && c.identificacionAsociado === ident && c.tipoCredito === tipo && VIVOS.includes(c.estado)),

    async crear(d, usuario, armarEvento) {
      if (await repo.existeActivo(d.identificacionAsociado, d.tipoCredito)) throw new AppError(409, 'CREDITO_DUPLICADO', 'duplicado');
      const id = creditos.length + 1;
      const c: Credito = { ...d, id, numeroCredito: `CR-2026-${String(id).padStart(6, '0')}`, estado: 'SOLICITADO', fechaSolicitud: ahora(), fechaActualizacion: ahora() };
      creditos.push(c);
      addHist(id, null, 'SOLICITADO', usuario, 'Crédito creado');
      const ev = armarEvento(c);
      eventos.push({ id: eventos.length + 1, eventId: ev.eventId, creditoId: id, evento: ev.evento, payload: JSON.stringify(ev.payload), estado: 'PENDIENTE', intentos: 0, ultimoCodigoHttp: null, ultimoError: null, fechaCreacion: ahora(), fechaEnvio: null });
      return c;
    },

    async listar(f) {
      let r = creditos.filter((c) => !c.eliminado);
      if (f.estado) r = r.filter((c) => c.estado === f.estado);
      if (f.identificacion) r = r.filter((c) => c.identificacionAsociado === f.identificacion);
      if (f.q) r = r.filter((c) => `${c.nombreAsociado} ${c.numeroCredito} ${c.identificacionAsociado}`.toLowerCase().includes(f.q!.toLowerCase()));
      r = [...r].sort((a, b) => (a[f.sort] > b[f.sort] ? 1 : -1) * (f.order === 'asc' ? 1 : -1));
      return { items: r.slice((f.page - 1) * f.pageSize, f.page * f.pageSize), total: r.length };
    },

    obtener: async (id) => vivo(id) ?? null,
    historial: async (id) => hist.filter((h) => h.creditoId === id),

    async actualizar(id, cambios, usuario, obs) {
      const c = vivo(id)!;
      Object.assign(c, cambios, { fechaActualizacion: ahora() });
      addHist(id, c.estado, c.estado, usuario, obs);
      return c;
    },

    async cambiarEstado(id, anterior, nuevo, usuario, obs) {
      const c = vivo(id);
      if (!c || c.estado !== anterior) return null;
      c.estado = nuevo;
      c.fechaActualizacion = ahora();
      addHist(id, anterior, nuevo, usuario, obs);
      return c;
    },

    async eliminar(id, usuario) {
      const c = vivo(id)!;
      c.eliminado = true;
      addHist(id, c.estado, c.estado, usuario, 'Crédito eliminado (borrado lógico)');
    },

    async resumen() {
      const out = Object.fromEntries(ESTADOS.map((e) => [e, 0])) as Record<Estado, number>;
      creditos.filter((c) => !c.eliminado).forEach((c) => out[c.estado]++);
      return out;
    },

    eventosPendientes: async () => eventos.filter((e) => e.estado === 'PENDIENTE'),
    eventosDeCredito: async (id) => eventos.filter((e) => e.creditoId === id),

    async registrarIntento(id, r) {
      const e = eventos.find((x) => x.id === id)!;
      e.intentos++;
      e.ultimoCodigoHttp = r.codigoHttp ?? null;
      e.ultimoError = r.error ?? null;
      e.estado = r.ok ? 'ENVIADO' : r.reintentarEnSeg === undefined ? 'FALLIDO' : 'PENDIENTE';
    },

    buscarUsuario: async (u) => usuarios.find((x) => x.username === u) ?? null,
    async crearUsuario(u) {
      if (usuarios.some((x) => x.username === u.username)) return false;
      usuarios.push({ ...u, id: usuarios.length + 1 });
      return true;
    },
    async sembrarUsuario(u) {
      if (!usuarios.some((x) => x.username === u.username)) usuarios.push({ ...u, id: usuarios.length + 1 });
    },
  };
  return repo;
}
