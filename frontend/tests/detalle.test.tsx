import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Detalle from '../src/paginas/Detalle'
import { detalle, ok, pintar, simular } from './helpers'

const abrir = () => pintar(<Detalle />, '/creditos/5', '/creditos/:id')
const cargar = (extra = {}) => simular({ 'GET /api/creditos/5': () => ok(detalle(extra)) })

describe('detalle', () => {
  it('muestra los datos, el historial y permite editar un crédito solicitado', async () => {
    cargar()
    abrir()

    expect(await screen.findByRole('heading', { name: /CR-2026-000005/ })).toBeInTheDocument()
    expect(screen.getByText('Juan Perez')).toBeInTheDocument()
    expect(screen.getByText('Crédito creado')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Editar' })).toHaveAttribute('href', '/creditos/5/editar')
    expect(screen.getByRole('button', { name: 'Pasar a estudio' })).toBeInTheDocument()
  })

  it('no ofrece editar un crédito aprobado, solo sus siguientes pasos', async () => {
    cargar({ estado: 'APROBADO' })
    abrir()

    await screen.findByRole('heading', { name: /CR-2026-000005/ })
    expect(screen.queryByRole('link', { name: 'Editar' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Registrar desembolso' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pasar a estudio' })).not.toBeInTheDocument()
  })

  it('un estado final no admite cambios', async () => {
    cargar({ estado: 'RECHAZADO' })
    abrir()

    expect(await screen.findByText(/estado final/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Aprobar|Pasar a estudio|desembolso/ })).not.toBeInTheDocument()
  })

  it('para rechazar pide el motivo y no llama a la API sin él', async () => {
    const f = cargar({ estado: 'EN_ESTUDIO' })
    abrir()
    await userEvent.click(await screen.findByRole('button', { name: 'Rechazar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar: Rechazar' }))

    expect(f.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false)
  })

  it('cambia el estado enviando la observación', async () => {
    const f = simular({
      'GET /api/creditos/5': () => ok(detalle({ estado: 'EN_ESTUDIO' })),
      'PATCH /api/creditos/5/estado': () => ok(detalle({ estado: 'RECHAZADO' })),
    })
    abrir()
    await userEvent.click(await screen.findByRole('button', { name: 'Rechazar' }))
    await userEvent.type(screen.getByLabelText(/Observación/), 'Sin capacidad de pago')
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar: Rechazar' }))

    const patch = f.mock.calls.find(([, init]) => init?.method === 'PATCH')!
    expect(JSON.parse(patch[1]!.body as string)).toEqual({ estado: 'RECHAZADO', observacion: 'Sin capacidad de pago' })
  })

  it('solo el administrador ve el botón Eliminar', async () => {
    localStorage.setItem('usuario', JSON.stringify({ username: 'analista', rol: 'ANALISTA' }))
    cargar()
    const { unmount } = abrir()
    await screen.findByRole('heading', { name: /CR-2026-000005/ })
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument()
    unmount()

    localStorage.setItem('usuario', JSON.stringify({ username: 'admin', rol: 'ADMIN' }))
    cargar()
    abrir()
    expect(await screen.findByRole('button', { name: 'Eliminar' })).toBeInTheDocument()
  })

  it('muestra el estado de la notificación al sistema externo', async () => {
    cargar({
      webhooks: [{ id: 1, eventId: 'x', estado: 'PENDIENTE', intentos: 1, ultimoCodigoHttp: null, ultimoError: 'fetch failed (ENOTFOUND)', fechaCreacion: '2026-10-21T15:00:00.000Z', fechaEnvio: null }],
    })
    abrir()

    expect(await screen.findByText('Pendiente')).toBeInTheDocument()
    expect(screen.getByText('fetch failed (ENOTFOUND)')).toBeInTheDocument()
  })
})
