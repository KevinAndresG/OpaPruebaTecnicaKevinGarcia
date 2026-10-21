import sql from 'mssql';
import { AppError } from './errors.js';
import { ESTADOS, type Credito, type Estado, type EventoWebhook, type Historial, type Repo, type Usuario } from './types.js';

const SELECT = `
  SELECT c.Id id, c.NumeroCredito numeroCredito, a.Identificacion identificacionAsociado, a.Nombre nombreAsociado,
         c.TipoCredito tipoCredito, c.ValorSolicitado valorSolicitado, c.TasaInteres tasaInteres, c.NumeroCuotas numeroCuotas,
         c.FormaPago formaPago, c.Estado estado, c.FechaSolicitud fechaSolicitud, c.FechaActualizacion fechaActualizacion
  FROM Creditos c JOIN Asociados a ON a.Id = c.AsociadoId`;

const ORDEN = { fechaSolicitud: 'c.FechaSolicitud', valorSolicitado: 'c.ValorSolicitado', numeroCredito: 'c.NumeroCredito', estado: 'c.Estado' };

const iso = (d: Date | null) => (d ? d.toISOString() : null);
const credito = (r: any): Credito => ({ ...r, fechaSolicitud: iso(r.fechaSolicitud), fechaActualizacion: iso(r.fechaActualizacion) });
const esDuplicado = (e: any) => e?.number === 2601 || e?.number === 2627;

export async function crearRepoSql(cfg: sql.config): Promise<Repo> {
  const pool = await new sql.ConnectionPool(cfg).connect();
  const req = (tx?: sql.Transaction) => (tx ? new sql.Request(tx) : pool.request());

  const porId = async (id: number, tx?: sql.Transaction) => {
    const r = await req(tx).input('id', sql.Int, id).query(`${SELECT} WHERE c.Id = @id AND c.Eliminado = 0`);
    return r.recordset[0] ? credito(r.recordset[0]) : null;
  };

  const historial = (r: sql.Request, id: number, ant: Estado | null, nuevo: Estado, usuario: string, obs: string | null) =>
    r
      .input('hid', sql.Int, id)
      .input('ant', sql.VarChar, ant)
      .input('nuevo', sql.VarChar, nuevo)
      .input('usuario', sql.VarChar, usuario)
      .input('obs', sql.NVarChar, obs)
      .query(`INSERT INTO HistorialCredito (CreditoId, EstadoAnterior, EstadoNuevo, Usuario, Observacion) VALUES (@hid, @ant, @nuevo, @usuario, @obs)`);

  const evento = (r: any): EventoWebhook => ({ ...r, fechaCreacion: iso(r.fechaCreacion)!, fechaEnvio: iso(r.fechaEnvio) });
  const EVENTO = `SELECT Id id, CONVERT(VARCHAR(36), EventId) eventId, CreditoId creditoId, Evento evento, Payload payload, Estado estado,
                         Intentos intentos, UltimoCodigoHttp ultimoCodigoHttp, UltimoError ultimoError, FechaCreacion fechaCreacion, FechaEnvio fechaEnvio
                  FROM WebhookEventos`;

  async function transaccion<T>(fn: (tx: sql.Transaction) => Promise<T>): Promise<T> {
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      const out = await fn(tx);
      await tx.commit();
      return out;
    } catch (e) {
      await tx.rollback().catch(() => {});
      if (esDuplicado(e)) throw new AppError(409, 'CREDITO_DUPLICADO', 'El asociado ya tiene un crédito activo de este tipo');
      throw e;
    }
  }

  return {
    async ping() {
      await pool.request().query('SELECT 1');
    },

    async existeActivo(identificacion, tipo) {
      const r = await req()
        .input('i', sql.VarChar, identificacion)
        .input('t', sql.VarChar, tipo)
        .query(`SELECT 1 x FROM Creditos c JOIN Asociados a ON a.Id = c.AsociadoId
                WHERE a.Identificacion = @i AND c.TipoCredito = @t AND c.Eliminado = 0
                  AND c.Estado IN ('SOLICITADO','EN_ESTUDIO','APROBADO')`);
      return r.recordset.length > 0;
    },

    crear: (d, usuario, armarEvento) =>
      transaccion(async (tx) => {
        const r = await req(tx)
          .input('ident', sql.VarChar, d.identificacionAsociado)
          .input('nombre', sql.NVarChar, d.nombreAsociado)
          .input('tipo', sql.VarChar, d.tipoCredito)
          .input('valor', sql.Decimal(18, 2), d.valorSolicitado)
          .input('tasa', sql.Decimal(5, 2), d.tasaInteres)
          .input('cuotas', sql.Int, d.numeroCuotas)
          .input('forma', sql.VarChar, d.formaPago).query(`
            DECLARE @aid INT = (SELECT Id FROM Asociados WHERE Identificacion = @ident);
            IF @aid IS NULL BEGIN
              INSERT INTO Asociados (Identificacion, Nombre) VALUES (@ident, @nombre);
              SET @aid = SCOPE_IDENTITY();
            END
            INSERT INTO Creditos (NumeroCredito, AsociadoId, TipoCredito, ValorSolicitado, TasaInteres, NumeroCuotas, FormaPago)
            OUTPUT INSERTED.Id
            VALUES ('CR-' + CAST(YEAR(SYSUTCDATETIME()) AS CHAR(4)) + '-' + RIGHT('000000' + CAST(NEXT VALUE FOR SeqNumeroCredito AS VARCHAR(10)), 6),
                    @aid, @tipo, @valor, @tasa, @cuotas, @forma);`);
        const c = (await porId(r.recordset[0].Id, tx))!;
        await historial(req(tx), c.id, null, 'SOLICITADO', usuario, 'Crédito creado');
        const ev = armarEvento(c);
        await req(tx)
          .input('eid', sql.UniqueIdentifier, ev.eventId)
          .input('cid', sql.Int, c.id)
          .input('ev', sql.VarChar, ev.evento)
          .input('payload', sql.NVarChar(sql.MAX), JSON.stringify(ev.payload))
          .query(`INSERT INTO WebhookEventos (EventId, CreditoId, Evento, Payload) VALUES (@eid, @cid, @ev, @payload)`);
        return c;
      }),

    async listar(f) {
      const filtrar = (r: sql.Request) => {
        const where = ['c.Eliminado = 0'];
        if (f.estado) (where.push('c.Estado = @estado'), r.input('estado', sql.VarChar, f.estado));
        if (f.identificacion) (where.push('a.Identificacion = @ident'), r.input('ident', sql.VarChar, f.identificacion));
        if (f.q) {
          where.push('(a.Nombre LIKE @q OR c.NumeroCredito LIKE @q OR a.Identificacion LIKE @q)');
          r.input('q', sql.NVarChar, `%${f.q}%`);
        }
        return `WHERE ${where.join(' AND ')}`;
      };
      const r1 = req();
      const total = await r1.query(`SELECT COUNT(*) n FROM Creditos c JOIN Asociados a ON a.Id = c.AsociadoId ${filtrar(r1)}`);
      const r2 = req().input('off', sql.Int, (f.page - 1) * f.pageSize).input('size', sql.Int, f.pageSize);
      const dir = f.order === 'asc' ? 'ASC' : 'DESC';
      const rows = await r2.query(`${SELECT} ${filtrar(r2)} ORDER BY ${ORDEN[f.sort]} ${dir}, c.Id DESC OFFSET @off ROWS FETCH NEXT @size ROWS ONLY`);
      return { items: rows.recordset.map(credito), total: total.recordset[0].n };
    },

    obtener: (id) => porId(id),

    async historial(id) {
      const r = await req()
        .input('id', sql.Int, id)
        .query(`SELECT Id id, CreditoId creditoId, EstadoAnterior estadoAnterior, EstadoNuevo estadoNuevo, Usuario usuario,
                       Observacion observacion, Fecha fecha FROM HistorialCredito WHERE CreditoId = @id ORDER BY Fecha, Id`);
      return r.recordset.map((h): Historial => ({ ...h, fecha: iso(h.fecha)! }));
    },

    actualizar: (id, c, usuario, obs) =>
      transaccion(async (tx) => {
        await req(tx)
          .input('id', sql.Int, id)
          .input('tipo', sql.VarChar, c.tipoCredito ?? null)
          .input('valor', sql.Decimal(18, 2), c.valorSolicitado ?? null)
          .input('tasa', sql.Decimal(5, 2), c.tasaInteres ?? null)
          .input('cuotas', sql.Int, c.numeroCuotas ?? null)
          .input('forma', sql.VarChar, c.formaPago ?? null)
          .query(`UPDATE Creditos SET TipoCredito = COALESCE(@tipo, TipoCredito), ValorSolicitado = COALESCE(@valor, ValorSolicitado),
                    TasaInteres = COALESCE(@tasa, TasaInteres), NumeroCuotas = COALESCE(@cuotas, NumeroCuotas),
                    FormaPago = COALESCE(@forma, FormaPago), FechaActualizacion = SYSUTCDATETIME() WHERE Id = @id`);
        const nuevo = (await porId(id, tx))!;
        await historial(req(tx), id, nuevo.estado, nuevo.estado, usuario, obs);
        return nuevo;
      }),

    cambiarEstado: (id, anterior, nuevo, usuario, obs) =>
      transaccion(async (tx) => {
        // si otra petición ya cambió el estado no se actualiza nada y se devuelve null
        const r = await req(tx)
          .input('id', sql.Int, id)
          .input('ant', sql.VarChar, anterior)
          .input('nuevo', sql.VarChar, nuevo)
          .query(`UPDATE Creditos SET Estado = @nuevo, FechaActualizacion = SYSUTCDATETIME() WHERE Id = @id AND Estado = @ant AND Eliminado = 0`);
        if (!r.rowsAffected[0]) return null;
        await historial(req(tx), id, anterior, nuevo, usuario, obs);
        return porId(id, tx);
      }),

    eliminar: (id, usuario) =>
      transaccion(async (tx) => {
        const c = (await porId(id, tx))!;
        await req(tx).input('id', sql.Int, id).query(`UPDATE Creditos SET Eliminado = 1, FechaActualizacion = SYSUTCDATETIME() WHERE Id = @id`);
        await historial(req(tx), id, c.estado, c.estado, usuario, 'Crédito eliminado (borrado lógico)');
      }),

    async resumen() {
      const r = await req().query(`SELECT Estado, COUNT(*) n FROM Creditos WHERE Eliminado = 0 GROUP BY Estado`);
      const out = Object.fromEntries(ESTADOS.map((e) => [e, 0])) as Record<Estado, number>;
      for (const row of r.recordset) out[row.Estado as Estado] = row.n;
      return out;
    },

    async eventosPendientes() {
      const r = await req().query(`${EVENTO.replace('SELECT', 'SELECT TOP 20')} WHERE Estado = 'PENDIENTE' AND ProximoIntento <= DATEADD(SECOND, 1, SYSUTCDATETIME()) ORDER BY Id`);
      return r.recordset.map(evento);
    },

    async eventosDeCredito(id) {
      const r = await req().input('id', sql.Int, id).query(`${EVENTO} WHERE CreditoId = @id ORDER BY Id`);
      return r.recordset.map(evento);
    },

    async registrarIntento(id, r) {
      await req()
        .input('id', sql.Int, id)
        .input('ok', sql.Bit, r.ok)
        .input('http', sql.Int, r.codigoHttp ?? null)
        .input('err', sql.NVarChar, r.error?.slice(0, 500) ?? null)
        .input('espera', sql.Int, r.reintentarEnSeg ?? null).query(`
          UPDATE WebhookEventos SET
            Intentos = Intentos + 1, UltimoCodigoHttp = @http, UltimoError = @err,
            Estado = CASE WHEN @ok = 1 THEN 'ENVIADO' WHEN @espera IS NULL THEN 'FALLIDO' ELSE 'PENDIENTE' END,
            FechaEnvio = CASE WHEN @ok = 1 THEN SYSUTCDATETIME() ELSE FechaEnvio END,
            ProximoIntento = CASE WHEN @espera IS NULL THEN ProximoIntento ELSE DATEADD(SECOND, @espera, SYSUTCDATETIME()) END
          WHERE Id = @id`);
    },

    async buscarUsuario(username) {
      const r = await req().input('u', sql.VarChar, username).query(`SELECT Id id, Username username, PasswordHash passwordHash, Rol rol FROM Usuarios WHERE Username = @u`);
      return (r.recordset[0] as Usuario) ?? null;
    },

    async crearUsuario(u) {
      try {
        await req()
          .input('u', sql.VarChar, u.username)
          .input('h', sql.VarChar, u.passwordHash)
          .input('r', sql.VarChar, u.rol)
          .query(`INSERT INTO Usuarios (Username, PasswordHash, Rol) VALUES (@u, @h, @r)`);
        return true;
      } catch (e) {
        if (esDuplicado(e)) return false;
        throw e;
      }
    },

    async sembrarUsuario(u) {
      await req()
        .input('u', sql.VarChar, u.username)
        .input('h', sql.VarChar, u.passwordHash)
        .input('r', sql.VarChar, u.rol)
        .query(`IF NOT EXISTS (SELECT 1 FROM Usuarios WHERE Username = @u) INSERT INTO Usuarios (Username, PasswordHash, Rol) VALUES (@u, @h, @r)`);
    },
  };
}
