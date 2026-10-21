import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Listado from '../src/paginas/Listado'
import { credito, ok, pintar, simular } from './helpers'

const meta = (extra = {}) => ({ page: 1, pageSize: 10, total: 2, totalPages: 1, ...extra })
const abrir = (ruta = '/creditos') => pintar(<Listado />, ruta, '/creditos')

describe('listado', () => {
  it('muestra los créditos con su estado y valor', async () => {
    simular({
      'GET /api/creditos': () =>
        ok([credito, { ...credito, id: 6, numeroCredito: 'CR-2026-000006', nombreAsociado: 'Ana Rios', estado: 'APROBADO' }], meta()),
    })
    abrir()

    expect(await screen.findByRole('link', { name: 'CR-2026-000005' })).toHaveAttribute('href', '/creditos/5')
    expect(screen.getByText('Ana Rios')).toBeInTheDocument()
    const tabla = within(screen.getByRole('table'))
    expect(tabla.getByText('Solicitado')).toBeInTheDocument()
    expect(tabla.getByText('Aprobado')).toBeInTheDocument()
    expect(tabla.getAllByText(/15\.000\.000/)).toHaveLength(2)
  })

  it('avisa cuando no hay resultados', async () => {
    simular({ 'GET /api/creditos': () => ok([], meta({ total: 0 })) })
    abrir()

    expect(await screen.findByText('No hay créditos que coincidan con los filtros.')).toBeInTheDocument()
  })

  it('pide la página siguiente y deshabilita Anterior en la primera', async () => {
    const f = simular({ 'GET /api/creditos': () => ok([credito], meta({ total: 25, totalPages: 3 })) })
    abrir()
    await screen.findByRole('link', { name: 'CR-2026-000005' })

    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }))

    const ultima = f.mock.calls.at(-1)![0] as string
    expect(ultima).toContain('page=2')
  })

  it('filtra por estado y vuelve a la primera página', async () => {
    const f = simular({ 'GET /api/creditos': () => ok([credito], meta({ total: 25, totalPages: 3 })) })
    abrir('/creditos?page=3')
    await screen.findByRole('link', { name: 'CR-2026-000005' })

    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'APROBADO')

    const ultima = f.mock.calls.at(-1)![0] as string
    expect(ultima).toContain('estado=APROBADO')
    expect(ultima).toContain('page=1')
  })

  it('muestra el error si la API falla', async () => {
    simular({ 'GET /api/creditos': () => new Response(JSON.stringify({ success: false, error: { code: 'ERROR_INTERNO', message: 'Ocurrió un error inesperado' } }), { status: 500 }) })
    abrir()

    expect(await screen.findByRole('alert')).toHaveTextContent('Ocurrió un error inesperado')
  })
})
