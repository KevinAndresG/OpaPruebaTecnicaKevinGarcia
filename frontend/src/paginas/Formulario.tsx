import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, ApiError, EDITABLES, FORMAS_PAGO, TIPOS, type Credito } from '../api'
import { moneda, NOMBRE_ESTADO, useToast } from '../ui'

const vacio = { identificacionAsociado: '', nombreAsociado: '', tipoCredito: '', valorSolicitado: '', tasaInteres: '', numeroCuotas: '', formaPago: '' }
type Campo = keyof typeof vacio
const EDITABLE: Campo[] = ['tipoCredito', 'valorSolicitado', 'tasaInteres', 'numeroCuotas', 'formaPago']

function validar(c: Campo, v: string): string {
  const n = Number(v)
  switch (c) {
    case 'identificacionAsociado': return /^\d{5,15}$/.test(v) ? '' : 'Solo números, entre 5 y 15 dígitos'
    case 'nombreAsociado': return v.trim().length >= 3 ? '' : 'Escriba el nombre completo (mínimo 3 letras)'
    case 'tipoCredito': return v ? '' : 'Seleccione el tipo de crédito'
    case 'formaPago': return v ? '' : 'Seleccione la forma de pago'
    case 'valorSolicitado': return v !== '' && n > 0 ? '' : 'El valor debe ser mayor a 0'
    case 'tasaInteres': return v !== '' && n >= 0 && n <= 100 ? '' : 'Ingrese una tasa entre 0 y 100'
    case 'numeroCuotas': return Number.isInteger(n) && n > 0 && n <= 360 ? '' : 'Ingrese un número de cuotas entre 1 y 360'
  }
}

export default function Formulario() {
  const { id } = useParams()
  const editando = !!id
  const navigate = useNavigate()
  const toast = useToast()
  const [original, setOriginal] = useState<Credito>()
  const [cargando, setCargando] = useState(editando)
  const [errorCarga, setErrorCarga] = useState('')
  const [datos, setDatos] = useState(vacio)
  const [errores, setErrores] = useState<Partial<Record<Campo, string>>>({})
  const [aviso, setAviso] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (!id) return
    api.detalle(id)
      .then((c) => {
        setOriginal(c)
        setDatos({
          identificacionAsociado: c.identificacionAsociado,
          nombreAsociado: c.nombreAsociado,
          tipoCredito: c.tipoCredito,
          valorSolicitado: String(c.valorSolicitado),
          tasaInteres: String(c.tasaInteres),
          numeroCuotas: String(c.numeroCuotas),
          formaPago: c.formaPago,
        })
      })
      .catch((e) => setErrorCarga(e.message))
      .finally(() => setCargando(false))
  }, [id])

  const poner = (c: Campo, v: string) => setDatos((d) => ({ ...d, [c]: v }))
  const revisar = (c: Campo) => setErrores((e) => ({ ...e, [c]: validar(c, datos[c]) }))

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const revisables = editando ? EDITABLE : (Object.keys(vacio) as Campo[])
    const malos = Object.fromEntries(revisables.map((c) => [c, validar(c, datos[c])]).filter(([, m]) => m))
    setErrores(malos)
    setAviso('')
    if (Object.keys(malos).length) {
      document.getElementById(Object.keys(malos)[0])?.focus()
      return
    }
    setEnviando(true)
    try {
      if (original) {
        const cambios: Record<string, string | number> = {}
        if (datos.tipoCredito !== original.tipoCredito) cambios.tipoCredito = datos.tipoCredito
        if (Number(datos.valorSolicitado) !== original.valorSolicitado) cambios.valorSolicitado = Number(datos.valorSolicitado)
        if (Number(datos.tasaInteres) !== original.tasaInteres) cambios.tasaInteres = Number(datos.tasaInteres)
        if (Number(datos.numeroCuotas) !== original.numeroCuotas) cambios.numeroCuotas = Number(datos.numeroCuotas)
        if (datos.formaPago !== original.formaPago) cambios.formaPago = datos.formaPago
        if (!Object.keys(cambios).length) {
          setAviso('No hay cambios para guardar')
          return
        }
        await api.editar(original.id, cambios)
        toast('ok', `Cambios guardados en ${original.numeroCredito}`)
        navigate(`/creditos/${original.id}`)
        return
      }
      const c = await api.crear({
        ...datos,
        nombreAsociado: datos.nombreAsociado.trim(),
        valorSolicitado: Number(datos.valorSolicitado),
        tasaInteres: Number(datos.tasaInteres),
        numeroCuotas: Number(datos.numeroCuotas),
      })
      toast('ok', `Solicitud ${c.numeroCredito} registrada`)
      navigate(`/creditos/${c.id}`)
    } catch (err) {
      if (err instanceof ApiError && err.details) {
        setErrores(Object.fromEntries(err.details.map((d) => [d.campo, d.mensaje])))
      }
      setAviso(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setEnviando(false)
    }
  }

  if (cargando) return <p className="suave">Cargando…</p>
  if (errorCarga) return <><p className="error" role="alert">{errorCarga}</p><Link to="/creditos">Volver al listado</Link></>
  if (original && !EDITABLES.includes(original.estado)) {
    return (
      <>
        <header className="cabecera"><h1>{original.numeroCredito}</h1></header>
        <div className="tarjeta">
          <p>Un crédito en estado <strong>{NOMBRE_ESTADO[original.estado]}</strong> no se puede editar.</p>
          <p className="suave">Solo se editan los créditos Solicitados o En estudio.</p>
          <Link className="btn-sec" to={`/creditos/${original.id}`}>Volver al detalle</Link>
        </div>
      </>
    )
  }

  const campo = (c: Campo, etiqueta: string, input: (props: object) => React.ReactNode, ayuda?: string, fijo = false) => (
    <div className="campo">
      <label htmlFor={c}>{etiqueta} {!fijo && <abbr title="obligatorio">*</abbr>}</label>
      {input({
        id: c, value: datos[c], 'aria-invalid': !!errores[c], 'aria-describedby': `${c}-msg`, readOnly: fijo,
        onChange: (ev: React.ChangeEvent<HTMLInputElement>) => poner(c, ev.target.value), onBlur: () => revisar(c),
      })}
      <small id={`${c}-msg`} className={errores[c] ? 'error' : 'suave'}>{errores[c] ?? (fijo ? 'No se puede modificar' : ayuda) ?? ''}</small>
    </div>
  )

  return (
    <>
      <header className="cabecera"><h1>{original ? `Editar ${original.numeroCredito}` : 'Nueva solicitud de crédito'}</h1></header>
      <form className="tarjeta formulario" onSubmit={enviar} noValidate>
        {aviso && <p className="error caja-error" role="alert">{aviso}</p>}

        <fieldset>
          <legend>Asociado</legend>
          {campo('identificacionAsociado', 'Identificación', (p) => <input inputMode="numeric" autoComplete="off" {...p} />, 'Cédula, sin puntos ni espacios', editando)}
          {campo('nombreAsociado', 'Nombre completo', (p) => <input autoComplete="off" {...p} />, undefined, editando)}
        </fieldset>

        <fieldset>
          <legend>Condiciones del crédito</legend>
          {campo('tipoCredito', 'Tipo de crédito', (p) => (
            <select {...p}><option value="">Seleccione…</option>{Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          ))}
          {campo('valorSolicitado', 'Valor solicitado (COP)', (p) => <input type="number" min="1" step="any" inputMode="decimal" {...p} />,
            Number(datos.valorSolicitado) > 0 ? moneda(Number(datos.valorSolicitado)) : 'Ej: 15000000')}
          {campo('tasaInteres', 'Tasa de interés mensual (%)', (p) => <input type="number" min="0" max="100" step="0.01" inputMode="decimal" {...p} />, 'Ej: 1.5')}
          {campo('numeroCuotas', 'Número de cuotas', (p) => <input type="number" min="1" max="360" step="1" inputMode="numeric" {...p} />, 'Entre 1 y 360 meses')}
          {campo('formaPago', 'Forma de pago', (p) => (
            <select {...p}><option value="">Seleccione…</option>{Object.entries(FORMAS_PAGO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          ))}
        </fieldset>

        <div className="acciones">
          <Link className="btn-sec" to={original ? `/creditos/${original.id}` : '/creditos'}>Cancelar</Link>
          <button className="btn" disabled={enviando}>
            {enviando ? 'Guardando…' : original ? 'Guardar cambios' : 'Registrar solicitud'}
          </button>
        </div>
      </form>
    </>
  )
}
