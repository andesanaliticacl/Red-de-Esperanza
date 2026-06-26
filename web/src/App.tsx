import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import BarraSuperior from './components/BarraSuperior'
import ProtectedRoute from './components/ProtectedRoute'
import ErrorBoundary from './components/ErrorBoundary'
// CiudadanoView es la pantalla principal (y el comodín *): se carga de una vez.
import CiudadanoView from './views/CiudadanoView'

// El resto de vistas se cargan bajo demanda (Fase 24: lazy loading), para que
// la primera carga del mapa sea lo más liviana posible.
const LoginView = lazy(() => import('./views/LoginView'))
const RegistroView = lazy(() => import('./views/RegistroView'))
const MisReportesView = lazy(() => import('./views/MisReportesView'))
const CentrosAcopioView = lazy(() => import('./views/CentrosAcopioView'))
const InicioRedirect = lazy(() => import('./views/InicioRedirect'))
const VoluntarioView = lazy(() => import('./views/VoluntarioView'))
const PerfilView = lazy(() => import('./views/PerfilView'))
const EditarPerfilView = lazy(() => import('./views/EditarPerfilView'))
const HistorialView = lazy(() => import('./views/HistorialView'))
const AdminView = lazy(() => import('./views/AdminView'))

function Cargando() {
  return (
    <div className="min-h-full flex items-center justify-center text-gray-500">
      Cargando…
    </div>
  )
}

export default function App() {
  return (
    <div className="h-full flex flex-col">
      <BarraSuperior />
      <main className="flex-1 min-h-0">
        <ErrorBoundary>
          <Suspense fallback={<Cargando />}>
            <Routes>
            {/* Público (sin login): mapa, reportar y SOS */}
            <Route path="/" element={<CiudadanoView />} />
            <Route path="/login" element={<LoginView />} />
            <Route path="/registro" element={<RegistroView />} />
            <Route path="/acopios" element={<CentrosAcopioView />} />
            <Route path="/inicio" element={<InicioRedirect />} />

            {/* Cualquier usuario autenticado: sus reportes y chats */}
            <Route
              path="/mis-reportes"
              element={
                <ProtectedRoute>
                  <MisReportesView />
                </ProtectedRoute>
              }
            />
            <Route
              path="/perfil"
              element={
                <ProtectedRoute>
                  <PerfilView />
                </ProtectedRoute>
              }
            />
            <Route
              path="/perfil/editar"
              element={
                <ProtectedRoute>
                  <EditarPerfilView />
                </ProtectedRoute>
              }
            />
            <Route
              path="/historial"
              element={
                <ProtectedRoute>
                  <HistorialView />
                </ProtectedRoute>
              }
            />

            {/* Voluntario y superiores */}
            <Route
              path="/voluntario"
              element={
                <ProtectedRoute
                  roles={['voluntario', 'rescatista', 'verificador', 'admin']}
                >
                  <VoluntarioView />
                </ProtectedRoute>
              }
            />

            {/* Solo admin */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute roles={['admin']}>
                  <AdminView />
                </ProtectedRoute>
              }
            />

            <Route path="*" element={<CiudadanoView />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  )
}
