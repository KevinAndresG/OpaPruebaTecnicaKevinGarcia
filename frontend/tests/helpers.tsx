import { vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import type { Credito, Detalle } from '../src/api'

const json = (cuerpo: unknown, status: number) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } })

export const ok = (data: unknown, meta?: unknown, status = 200) => json({ success: true, data, ...(meta ? { meta } : {}) }, status)
export const fallo = (status: number, code: string, message: string) => json({ success: false, error: { code, message } }, status)

export function simular(rutas: Record<string, (init?: RequestInit) => Response>) {
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    const clave = `${init?.method ?? 'GET'} ${url.split('?')[0]}`
    const respuesta = rutas[clave]
    if (!respuesta) throw new Error(`Sin simulación para ${clave}`)
    return respuesta(init)
  })
  vi.stubGlobal('fetch', f)
  return f
}

export function pintar(ui: ReactElement, ruta = '/', patron = '*') {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path={patron} element={ui} />
        <Route path="*" element={<p>otra pantalla</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

export const credito: Credito = {
  id: 5,
  numeroCredito: 'CR-2026-000005',
  identificacionAsociado: '1001234567',
  nombreAsociado: 'Juan Perez',
  tipoCredito: 'LIBRE_INVERSION',
  valorSolicitado: 15000000,
  tasaInteres: 1.5,
  numeroCuotas: 36,
  formaPago: 'NOMINA',
  estado: 'SOLICITADO',
  fechaSolicitud: '2026-10-21T15:00:00.000Z',
  fechaActualizacion: '2026-10-21T15:00:00.000Z',
}

export const detalle = (extra: Partial<Detalle> = {}): Detalle => ({
  ...credito,
  historial: [{ id: 1, estadoAnterior: null, estadoNuevo: 'SOLICITADO', usuario: 'admin', observacion: 'Crédito creado', fecha: '2026-10-21T15:00:00.000Z' }],
  webhooks: [],
  ...extra,
})
