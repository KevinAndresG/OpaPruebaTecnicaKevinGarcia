import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, EDITABLES, FORMAS_PAGO, sesion, TIPOS, TRANSICIONES, type Detalle as DetalleCredito, type Estado } from '../api'
import { Estatus, fechaHora, moneda, NOMBRE_ESTADO, useToast } from '../ui'

const ACCION: Partial<Record<Estado, string>> = {
  EN_ESTUDIO: 'Pasar a estudio',
  APROBADO: 'Aprobar',
  RECHAZADO: 'Rechazar',
  DESEMBOLSADO: 'Registrar desembolso',
  CANCELADO: 'Cancelar crédito',
}

export default function Detalle() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [c, setC] = useState<DetalleCredito>()
  const [error, setError] = useState('')
  const [pendiente, setPendiente] = useState<Estado | null>(null)
  const [observacion, setObservacion] = useState('')
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(() => api.detalle(id!).then(setC).catch((e) => setError(e.message)), [id])
  useEffect(() => { cargar() }, [cargar])

  async function confirmar() {
    if (!c || !pendiente) return
    if (pendiente === 'RECHAZADO' && !observacion.trim()) return toast('error', 'Indique el motivo del rechazo')
    setGuardando(true)
    try {
      await api.cambiarEstado(c.id, pendiente, observacion.trim())
      toast('ok', `Crédito ${NOMBRE_ESTADO[pendiente].toLowerCase()}`)
      setPendiente(null)
      setObservacion('')
      await cargar()
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'No se pudo cambiar el estado')
    } finally {
      setGuardando(false)
    }
  }

  async function eliminar() {
    if (!c || !confirm(`¿Eliminar el crédito ${c.numeroCredito}? Quedará registrado en el historial.`)) return
    try {
      await api.eliminar(c.id)
      toast('ok', 'Crédito eliminado')
      navigate('/creditos')
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'No se pudo eliminar')
    }
  }

  if (error) return <><p className="error" role="alert">{error}</p><Link to="/creditos">Volver al listado</Link></>
  if (!c) return <p className="suave">Cargando…</p>

  const siguientes = TRANSICIONES[c.estado]
  const datos: [string, string][] = [
    ['Asociado', c.nombreAsociado],
    ['Identificación', c.identificacionAsociado],
    ['Tipo de crédito', TIPOS[c.tipoCredito]],
    ['Valor solicitado', moneda(c.valorSolicitado)],
    ['Tasa mensual', `${c.tasaInteres}%`],
    ['Cuotas', String(c.numeroCuotas)],
    ['Forma de pago', FORMAS_PAGO[c.formaPago]],
    ['Solicitado', fechaHora(c.fechaSolicitud)],
    ['Última actualización', fechaHora(c.fechaActualizacion)],
  ]

  return (
    <>
      <p><Link to="/creditos">← Créditos</Link></p>
      <header className="cabecera">
        <h1>{c.numeroCredito} <Estatus estado={c.estado} /></h1>
        <div className="acciones">
          {EDITABLES.includes(c.estado) && <Link className="btn-sec" to={`/creditos/${c.id}/editar`}>Editar</Link>}
          {sesion.usuario()?.rol === 'ADMIN' && c.estado !== 'DESEMBOLSADO' && <button className="btn-peligro" onClick={eliminar}>Eliminar</button>}
        </div>
      </header>

      <div className="detalle-grid">
        <section className="tarjeta">
          <h2>Información</h2>
          <dl className="datos">{datos.map(([k, v]) => <div key={k}><dt>{k}</dt><dd className={k === 'Valor solicitado' ? 'num' : ''}>{v}</dd></div>)}</dl>
          {!EDITABLES.includes(c.estado) && <p className="suave">Las condiciones solo se pueden editar mientras el crédito está Solicitado o En estudio.</p>}

          {siguientes.length > 0 && (
            <div className="cambio-estado">
              <h3>Cambiar estado</h3>
              {!pendiente ? (
                <div className="acciones izq">
                  {siguientes.map((s) => <button key={s} className={s === 'RECHAZADO' || s === 'CANCELADO' ? 'btn-sec' : 'btn'} onClick={() => setPendiente(s)}>{ACCION[s]}</button>)}
                </div>
              ) : (
                <div>
                  <label htmlFor="obs">
                    Observación {pendiente === 'RECHAZADO' ? <abbr title="obligatorio">*</abbr> : <span className="suave">(opcional)</span>}
                  </label>
                  <textarea id="obs" rows={3} maxLength={500} value={observacion} onChange={(e) => setObservacion(e.target.value)} autoFocus />
                  <div className="acciones izq">
                    <button className="btn" disabled={guardando} onClick={confirmar}>{guardando ? 'Guardando…' : `Confirmar: ${ACCION[pendiente]}`}</button>
                    <button className="btn-sec" onClick={() => { setPendiente(null); setObservacion('') }}>Volver</button>
                  </div>
                </div>
              )}
            </div>
          )}
          {siguientes.length === 0 && <p className="suave">Este crédito está en un estado final, no admite más cambios.</p>}
        </section>

        <div className="columna">
          <section className="tarjeta">
            <h2>Historial</h2>
            <ol className="linea">
              {[...c.historial].reverse().map((h) => (
                <li key={h.id}>
                  <strong>{h.estadoAnterior === h.estadoNuevo ? (h.observacion?.startsWith('Edición') ? 'Edición' : NOMBRE_ESTADO[h.estadoNuevo]) :`${h.estadoAnterior ? NOMBRE_ESTADO[h.estadoAnterior] + ' → ' : ''}${NOMBRE_ESTADO[h.estadoNuevo]}`}</strong>
                  {h.observacion && <p>{h.observacion}</p>}
                  <small>{h.usuario} · {fechaHora(h.fecha)}</small>
                </li>
              ))}
            </ol>
          </section>

          <section className="tarjeta">
            <h2>Notificación al sistema externo</h2>
            {c.webhooks.length === 0 ? <p className="suave">Sin notificaciones registradas.</p> : c.webhooks.map((w) => (
              <p key={w.id} className="webhook">
                <span className={`ws w-${w.estado}`}>{{ ENVIADO: 'Enviada', PENDIENTE: 'Pendiente', FALLIDO: 'Fallida' }[w.estado]}</span>
                {' '}· {w.intentos} {w.intentos === 1 ? 'intento' : 'intentos'}
                {w.ultimoError && <small className="error">{w.ultimoError}</small>}
                <small>{w.fechaEnvio ? `Enviada ${fechaHora(w.fechaEnvio)}` : `Creada ${fechaHora(w.fechaCreacion)}`}</small>
              </p>
            ))}
          </section>
        </div>
      </div>
    </>
  )
}
