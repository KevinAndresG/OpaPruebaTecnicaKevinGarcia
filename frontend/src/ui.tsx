import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import type { Estado } from './api'

export const moneda = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)
export const fecha = (iso: string) => new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(new Date(iso))
export const fechaHora = (iso: string) => new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))

export const NOMBRE_ESTADO: Record<Estado, string> = {
  SOLICITADO: 'Solicitado',
  EN_ESTUDIO: 'En estudio',
  APROBADO: 'Aprobado',
  RECHAZADO: 'Rechazado',
  DESEMBOLSADO: 'Desembolsado',
  CANCELADO: 'Cancelado',
}

export const Estatus = ({ estado }: { estado: Estado }) => (
  <span className={`estatus e-${estado}`}>
    <i aria-hidden="true" />
    {NOMBRE_ESTADO[estado]}
  </span>
)

type Aviso = { id: number; tipo: 'ok' | 'error'; texto: string }
const ToastCtx = createContext<(tipo: Aviso['tipo'], texto: string) => void>(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const mostrar = useCallback((tipo: Aviso['tipo'], texto: string) => {
    const id = Date.now() + Math.random()
    setAvisos((a) => [...a, { id, tipo, texto }])
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), 5000)
  }, [])
  return (
    <ToastCtx.Provider value={mostrar}>
      {children}
      <div className="toasts" aria-live="polite">
        {avisos.map((a) => (
          <div key={a.id} className={`toast t-${a.tipo}`}>
            {a.texto}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
