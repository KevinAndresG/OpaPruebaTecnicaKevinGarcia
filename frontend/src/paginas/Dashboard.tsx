import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ESTADOS, TIPOS, type Credito, type Estado } from '../api'
import { Estatus, fecha, moneda, NOMBRE_ESTADO } from '../ui'

export default function Dashboard() {
  const [resumen, setResumen] = useState<{ total: number; porEstado: Record<Estado, number> }>()
  const [recientes, setRecientes] = useState<Credito[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    api.resumen().then(setResumen).catch((e) => setError(e.message))
    api.listar(new URLSearchParams({ pageSize: '5' })).then((r) => setRecientes(r.data)).catch(() => {})
  }, [])

  if (error) return <p className="error" role="alert">{error}</p>
  if (!resumen) return <p className="suave">Cargando resumen…</p>

  const mayor = Math.max(1, ...Object.values(resumen.porEstado))

  return (
    <>
      <header className="cabecera">
        <h1>Resumen de créditos</h1>
        <Link className="btn" to="/creditos/nuevo">Nueva solicitud</Link>
      </header>

      <section className="grid-resumen">
        <div className="tarjeta total">
          <span className="suave">Créditos registrados</span>
          <strong className="cifra">{resumen.total}</strong>
        </div>

        <div className="tarjeta">
          <h2>Por estado</h2>
          <ul className="barras">
            {ESTADOS.map((e) => (
              <li key={e}>
                <Link to={`/creditos?estado=${e}`}>
                  <span>{NOMBRE_ESTADO[e]}</span>
                  <span className="barra"><i className={`e-${e}`} style={{ width: `${(resumen.porEstado[e] / mayor) * 100}%` }} /></span>
                  <b>{resumen.porEstado[e]}</b>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="tarjeta">
        <h2>Últimas solicitudes</h2>
        {recientes.length === 0 ? (
          <p className="suave">Todavía no hay solicitudes. Cree la primera con «Nueva solicitud».</p>
        ) : (
          <div className="tabla-wrap">
            <table>
              <thead><tr><th>Crédito</th><th>Asociado</th><th>Tipo</th><th className="num">Valor</th><th>Estado</th><th>Fecha</th></tr></thead>
              <tbody>
                {recientes.map((c) => (
                  <tr key={c.id}>
                    <td data-label="Crédito"><Link to={`/creditos/${c.id}`}>{c.numeroCredito}</Link></td>
                    <td data-label="Asociado">{c.nombreAsociado}</td>
                    <td data-label="Tipo">{TIPOS[c.tipoCredito]}</td>
                    <td className="num" data-label="Valor">{moneda(c.valorSolicitado)}</td>
                    <td data-label="Estado"><Estatus estado={c.estado} /></td>
                    <td data-label="Fecha">{fecha(c.fechaSolicitud)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
