import { Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { sesion } from './api'
import Dashboard from './paginas/Dashboard'
import Detalle from './paginas/Detalle'
import Listado from './paginas/Listado'
import Login from './paginas/Login'
import Formulario from './paginas/Formulario'

function Layout() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const usuario = sesion.usuario()
  if (!sesion.token()) return <Navigate to="/login" replace />

  return (
    <div className="shell">
      <a className="saltar" href="#contenido">Saltar al contenido</a>
      <aside className="lateral">
        <div className="marca">
          <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
            <circle cx="12" cy="16" r="6" fill="none" stroke="#e0b25a" strokeWidth="3" />
            <circle cx="20" cy="16" r="6" fill="none" stroke="#f5f3ec" strokeWidth="3" />
          </svg>
          <div>
            <strong>Créditos</strong>
            <span>Cooperativa de asociados</span>
          </div>
        </div>
        <nav aria-label="Principal">
          <NavLink to="/" end>Resumen</NavLink>
          <NavLink to="/creditos" className={({ isActive }) => (isActive && pathname !== '/creditos/nuevo' ? 'active' : '')}>Créditos</NavLink>
          <NavLink to="/creditos/nuevo">Nueva solicitud</NavLink>
        </nav>
        <div className="usuario">
          <span>{usuario?.username} · {usuario?.rol === 'ADMIN' ? 'Administrador' : 'Analista'}</span>
          <button className="btn-texto" onClick={() => { sesion.cerrar(); navigate('/login') }}>Cerrar sesión</button>
        </div>
      </aside>
      <main id="contenido">
        <Outlet />
      </main>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="creditos" element={<Listado />} />
        <Route path="creditos/nuevo" element={<Formulario />} />
        <Route path="creditos/:id/editar" element={<Formulario />} />
        <Route path="creditos/:id" element={<Detalle />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
