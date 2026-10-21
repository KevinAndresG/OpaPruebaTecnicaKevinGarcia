import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { api, ApiError, sesion } from '../api'
import { useToast } from '../ui'

const REGLAS = [
  { texto: '8 caracteres o más', cumple: (c: string) => c.length >= 8 },
  { texto: 'Una mayúscula', cumple: (c: string) => /[A-Z]/.test(c) },
  { texto: 'Una minúscula', cumple: (c: string) => /[a-z]/.test(c) },
  { texto: 'Un número', cumple: (c: string) => /\d/.test(c) },
  { texto: 'Un símbolo', cumple: (c: string) => /[^A-Za-z0-9]/.test(c) },
]
const USUARIO_VALIDO = /^[a-z0-9._]{4,30}$/

function Ojo({ abierto }: { abierto: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {abierto ? (
        <>
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : (
        <>
          <path d="M9.9 4.2A10 10 0 0 1 12 4c7 0 10 8 10 8a17 17 0 0 1-2.2 3.3" />
          <path d="M6.6 6.6A17 17 0 0 0 2 12s3 8 10 8a9.7 9.7 0 0 0 5.4-1.6" />
          <path d="M14.1 14.1a3 3 0 1 1-4.2-4.2" />
          <line x1="2" y1="2" x2="22" y2="22" />
        </>
      )}
    </svg>
  )
}

function CampoClave(props: { id: string; etiqueta: string; valor: string; onChange: (v: string) => void; autoComplete: string; error?: string }) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="campo">
      <label htmlFor={props.id}>{props.etiqueta}</label>
      <div className="clave">
        <input
          id={props.id}
          type={visible ? 'text' : 'password'}
          value={props.valor}
          onChange={(e) => props.onChange(e.target.value)}
          autoComplete={props.autoComplete}
          aria-invalid={!!props.error}
          aria-describedby={props.error ? `${props.id}-msg` : undefined}
          required
        />
        <button type="button" className="ojo" onClick={() => setVisible((v) => !v)} aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={visible}>
          <Ojo abierto={!visible} />
        </button>
      </div>
      {props.error && <small id={`${props.id}-msg`} className="error">{props.error}</small>}
    </div>
  )
}

export default function Login() {
  const navigate = useNavigate()
  const toast = useToast()
  const [modo, setModo] = useState<'ingresar' | 'registro'>('ingresar')
  const [usuario, setUsuario] = useState('')
  const [clave, setClave] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [aviso, setAviso] = useState('')
  const [enviando, setEnviando] = useState(false)
  if (sesion.token()) return <Navigate to="/" replace />

  const registro = modo === 'registro'

  function cambiarModo(m: typeof modo) {
    setModo(m)
    setErrores({})
    setAviso('')
    setClave('')
    setConfirmacion('')
  }

  function validarRegistro() {
    const e: Record<string, string> = {}
    if (!USUARIO_VALIDO.test(usuario.trim().toLowerCase())) e.username = 'Entre 4 y 30 caracteres: letras, números, punto o guion bajo'
    if (!REGLAS.every((r) => r.cumple(clave))) e.password = 'La contraseña no cumple todos los requisitos'
    if (clave !== confirmacion) e.confirmacion = 'Las contraseñas no coinciden'
    return e
  }

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setAviso('')
    const malos = registro ? validarRegistro() : {}
    setErrores(malos)
    if (Object.keys(malos).length) return
    setEnviando(true)
    try {
      const r = registro ? await api.registro(usuario, clave) : await api.login(usuario, clave)
      sesion.guardar(r.token, r.usuario)
      if (registro) toast('ok', `Cuenta creada. Bienvenido, ${r.usuario.username}`)
      navigate('/')
    } catch (err) {
      if (err instanceof ApiError && err.details) setErrores(Object.fromEntries(err.details.map((d) => [d.campo, d.mensaje])))
      setAviso(err instanceof Error ? err.message : 'No se pudo completar la operación')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="login">
      <form className="tarjeta login-caja" onSubmit={enviar} noValidate>
        <div className="modo" role="group" aria-label="Tipo de acceso">
          <button type="button" aria-pressed={!registro} onClick={() => cambiarModo('ingresar')}>Ingresar</button>
          <button type="button" aria-pressed={registro} onClick={() => cambiarModo('registro')}>Crear cuenta</button>
        </div>

        <h1>{registro ? 'Crear una cuenta' : 'Ingreso al módulo de créditos'}</h1>
        <p className="suave">{registro ? 'Las cuentas nuevas tienen rol de analista.' : 'Use su usuario asignado por la cooperativa.'}</p>

        <div className="campo">
          <label htmlFor="username">Usuario</label>
          <input
            id="username"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            aria-invalid={!!errores.username}
            required
            autoFocus
          />
          {(errores.username || registro) && (
            <small className={errores.username ? 'error' : 'suave'}>{errores.username ?? 'Letras, números, punto o guion bajo (4 a 30)'}</small>
          )}
        </div>

        <CampoClave id="password" etiqueta="Contraseña" valor={clave} onChange={setClave} autoComplete={registro ? 'new-password' : 'current-password'} error={errores.password} />

        {registro && (
          <>
            <ul className="reglas" aria-label="Requisitos de la contraseña">
              {REGLAS.map((r) => {
                const cumple = r.cumple(clave)
                return (
                  <li key={r.texto} className={cumple ? 'ok' : ''}>
                    {cumple ? '✓' : '·'} {r.texto}
                    <span className="sr-only">{cumple ? ' (cumple)' : ' (pendiente)'}</span>
                  </li>
                )
              })}
            </ul>
            <CampoClave id="confirmacion" etiqueta="Confirmar contraseña" valor={confirmacion} onChange={setConfirmacion} autoComplete="new-password" error={errores.confirmacion} />
          </>
        )}

        {aviso && <p className="error" role="alert">{aviso}</p>}
        <button className="btn" disabled={enviando}>
          {enviando ? (registro ? 'Creando cuenta…' : 'Ingresando…') : registro ? 'Crear cuenta' : 'Ingresar'}
        </button>
      </form>
    </div>
  )
}
