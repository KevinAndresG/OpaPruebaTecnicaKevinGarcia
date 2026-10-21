import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Login from '../src/paginas/Login'
import { fallo, ok, pintar, simular } from './helpers'

describe('login', () => {
  it('muestra y oculta la contraseña con el ojo', async () => {
    pintar(<Login />, '/login', '/login')
    const clave = screen.getByLabelText('Contraseña')
    expect(clave).toHaveAttribute('type', 'password')

    await userEvent.click(screen.getByRole('button', { name: 'Mostrar contraseña' }))
    expect(clave).toHaveAttribute('type', 'text')

    await userEvent.click(screen.getByRole('button', { name: 'Ocultar contraseña' }))
    expect(clave).toHaveAttribute('type', 'password')
  })

  it('muestra el mensaje del servidor si las credenciales son incorrectas', async () => {
    simular({ 'POST /api/auth/login': () => fallo(401, 'CREDENCIALES_INVALIDAS', 'Usuario o contraseña incorrectos') })
    pintar(<Login />, '/login', '/login')
    await userEvent.type(screen.getByLabelText('Usuario'), 'admin')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'mala')
    await userEvent.click(screen.getAllByRole('button', { name: 'Ingresar' }).at(-1)!)

    expect(await screen.findByRole('alert')).toHaveTextContent('Usuario o contraseña incorrectos')
    expect(localStorage.getItem('token')).toBeNull()
  })

  it('guarda la sesión al ingresar', async () => {
    simular({ 'POST /api/auth/login': () => ok({ token: 'abc', usuario: { username: 'admin', rol: 'ADMIN' } }) })
    pintar(<Login />, '/login', '/login')
    await userEvent.type(screen.getByLabelText('Usuario'), 'admin')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'Admin123*')
    await userEvent.click(screen.getAllByRole('button', { name: 'Ingresar' }).at(-1)!)

    await screen.findByText('otra pantalla')
    expect(localStorage.getItem('token')).toBe('abc')
  })
})

describe('registro', () => {
  const abrirRegistro = async () => {
    pintar(<Login />, '/login', '/login')
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }))
  }

  it('marca los requisitos de la contraseña mientras se escribe', async () => {
    await abrirRegistro()
    const requisito = (texto: string) => screen.getByText(texto, { exact: false }).closest('li')!

    expect(within(requisito('Un símbolo')).getByText('(pendiente)')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Contraseña'), 'Clave_Segura1')
    for (const texto of ['8 caracteres', 'Una mayúscula', 'Una minúscula', 'Un número', 'Un símbolo']) {
      expect(within(requisito(texto)).getByText('(cumple)')).toBeInTheDocument()
    }
  })

  it('no envía si la contraseña es débil o no coincide', async () => {
    const f = simular({})
    await abrirRegistro()
    await userEvent.type(screen.getByLabelText('Usuario'), 'maria.lopez')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'Clave_Segura1')
    await userEvent.type(screen.getByLabelText('Confirmar contraseña'), 'Otra_Clave2')
    await userEvent.click(screen.getAllByRole('button', { name: 'Crear cuenta' }).at(-1)!)

    expect(await screen.findByText('Las contraseñas no coinciden')).toBeInTheDocument()
    expect(f).not.toHaveBeenCalled()
  })

  it('rechaza una contraseña que no cumple los requisitos', async () => {
    const f = simular({})
    await abrirRegistro()
    await userEvent.type(screen.getByLabelText('Usuario'), 'maria.lopez')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'debil')
    await userEvent.type(screen.getByLabelText('Confirmar contraseña'), 'debil')
    await userEvent.click(screen.getAllByRole('button', { name: 'Crear cuenta' }).at(-1)!)

    expect(await screen.findByText('La contraseña no cumple todos los requisitos')).toBeInTheDocument()
    expect(f).not.toHaveBeenCalled()
  })

  it('crea la cuenta y entra', async () => {
    const f = simular({ 'POST /api/auth/registro': () => ok({ token: 'tok', usuario: { username: 'maria.lopez', rol: 'ANALISTA' } }, undefined, 201) })
    await abrirRegistro()
    await userEvent.type(screen.getByLabelText('Usuario'), 'Maria.Lopez')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'Clave_Segura1')
    await userEvent.type(screen.getByLabelText('Confirmar contraseña'), 'Clave_Segura1')
    await userEvent.click(screen.getAllByRole('button', { name: 'Crear cuenta' }).at(-1)!)

    await screen.findByText('otra pantalla')
    expect(JSON.parse(f.mock.calls[0][1]!.body as string)).toEqual({ username: 'Maria.Lopez', password: 'Clave_Segura1' })
    expect(localStorage.getItem('token')).toBe('tok')
  })
})
