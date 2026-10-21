import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Formulario from '../src/paginas/Formulario'
import { credito, fallo, ok, pintar, simular } from './helpers'

const crear = () => pintar(<Formulario />, '/creditos/nuevo', '/creditos/nuevo')
const editar = () => pintar(<Formulario />, '/creditos/5/editar', '/creditos/:id/editar')

async function llenarSolicitud() {
  await userEvent.type(screen.getByLabelText(/Identificación/), '1001234567')
  await userEvent.type(screen.getByLabelText(/Nombre completo/), 'Juan Perez')
  await userEvent.selectOptions(screen.getByLabelText(/Tipo de crédito/), 'LIBRE_INVERSION')
  await userEvent.type(screen.getByLabelText(/Valor solicitado/), '15000000')
  await userEvent.type(screen.getByLabelText(/Tasa de interés/), '1.5')
  await userEvent.type(screen.getByLabelText(/Número de cuotas/), '36')
  await userEvent.selectOptions(screen.getByLabelText(/Forma de pago/), 'NOMINA')
}

describe('crear solicitud', () => {
  it('muestra los errores de cada campo y no envía nada', async () => {
    const f = simular({})
    crear()
    await userEvent.click(screen.getByRole('button', { name: 'Registrar solicitud' }))

    expect(screen.getByText('Solo números, entre 5 y 15 dígitos')).toBeInTheDocument()
    expect(screen.getByText('El valor debe ser mayor a 0')).toBeInTheDocument()
    expect(screen.getByText('Seleccione el tipo de crédito')).toBeInTheDocument()
    expect(f).not.toHaveBeenCalled()
  })

  it('rechaza valores fuera de rango', async () => {
    crear()
    await userEvent.type(screen.getByLabelText(/Número de cuotas/), '0')
    await userEvent.type(screen.getByLabelText(/Tasa de interés/), '-2')
    await userEvent.click(screen.getByRole('button', { name: 'Registrar solicitud' }))

    expect(screen.getByText('Ingrese un número de cuotas entre 1 y 360')).toBeInTheDocument()
    expect(screen.getByText('Ingrese una tasa entre 0 y 100')).toBeInTheDocument()
  })

  it('envía los valores numéricos como números', async () => {
    const f = simular({ 'POST /api/creditos': () => ok({ ...credito, id: 9 }, undefined, 201) })
    crear()
    await llenarSolicitud()
    await userEvent.click(screen.getByRole('button', { name: 'Registrar solicitud' }))

    await screen.findByText('otra pantalla')
    expect(JSON.parse(f.mock.calls[0][1]!.body as string)).toEqual({
      identificacionAsociado: '1001234567',
      nombreAsociado: 'Juan Perez',
      tipoCredito: 'LIBRE_INVERSION',
      valorSolicitado: 15000000,
      tasaInteres: 1.5,
      numeroCuotas: 36,
      formaPago: 'NOMINA',
    })
  })

  it('muestra el error del servidor si el crédito está duplicado', async () => {
    simular({ 'POST /api/creditos': () => fallo(409, 'CREDITO_DUPLICADO', 'El asociado ya tiene un crédito activo de este tipo') })
    crear()
    await llenarSolicitud()
    await userEvent.click(screen.getByRole('button', { name: 'Registrar solicitud' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('ya tiene un crédito activo')
  })
})

describe('editar solicitud', () => {
  it('carga los datos y bloquea identificación y nombre', async () => {
    simular({ 'GET /api/creditos/5': () => ok({ ...credito, historial: [], webhooks: [] }) })
    editar()

    expect(await screen.findByRole('heading', { name: 'Editar CR-2026-000005' })).toBeInTheDocument()
    expect(screen.getByLabelText(/Identificación/)).toHaveValue('1001234567')
    expect(screen.getByLabelText(/Identificación/)).toHaveAttribute('readonly')
    expect(screen.getByLabelText(/Nombre completo/)).toHaveAttribute('readonly')
    expect(screen.getByLabelText(/Valor solicitado/)).toHaveValue(15000000)
  })

  it('avisa si no hay cambios y no llama a la API', async () => {
    const f = simular({ 'GET /api/creditos/5': () => ok({ ...credito, historial: [], webhooks: [] }) })
    editar()
    await screen.findByRole('heading', { name: 'Editar CR-2026-000005' })
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(screen.getByRole('alert')).toHaveTextContent('No hay cambios para guardar')
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('envía solo el campo que cambió', async () => {
    const f = simular({
      'GET /api/creditos/5': () => ok({ ...credito, historial: [], webhooks: [] }),
      'PATCH /api/creditos/5': () => ok({ ...credito, valorSolicitado: 18000000 }),
    })
    editar()
    await screen.findByRole('heading', { name: 'Editar CR-2026-000005' })
    const valor = screen.getByLabelText(/Valor solicitado/)
    await userEvent.clear(valor)
    await userEvent.type(valor, '18000000')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await screen.findByText('otra pantalla')
    const patch = f.mock.calls.find(([, init]) => init?.method === 'PATCH')!
    expect(JSON.parse(patch[1]!.body as string)).toEqual({ valorSolicitado: 18000000 })
  })

  it('no muestra el formulario si el crédito ya no se puede editar', async () => {
    simular({ 'GET /api/creditos/5': () => ok({ ...credito, estado: 'APROBADO', historial: [], webhooks: [] }) })
    editar()

    expect(await screen.findByText(/no se puede editar/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument()
  })
})
