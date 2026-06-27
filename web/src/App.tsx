import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import BarraSuperior from './components/BarraSuperior'
import ProtectedRoute from './components/ProtectedRoute'
import ErrorBoundary from './components/ErrorBoundary'
// CiudadanoView es la pantalla principal: se carga de una vez.
import CiudadanoView from './views/CiudadanoView'
import NoEncontrada from './views/NoEncontrada'

// El resto de vistas se cargan bajo demanda (Fase 24: lazy loading), para que
// la primera carga del mapa sea lo más liviana posible.
const LoginView = lazy(() => import('./views/LoginView'))
const RegistroView = lazy(() => import('./views/RegistroView'))
const MisReportesView = lazy(() => import('./views/MisReportesView'))
const CentrosAcopioView = lazy(() => import('./views/CentrosAcopioView'))
const VoluntarioView = lazy(() => import('./views/VoluntarioView'))
const PerfilView = lazy(() => import('./views/PerfilView'))
const EditarPerfilView = lazy(() => import('./views/EditarPerfilView'))
const HistorialView = lazy(() => import('./views/HistorialView'))
const MisConversacionesView = lazy(
  () => import('./views/MisConversacionesView'),
)
const AdminView = lazy(() => import('./views/AdminView'))
const ScrapingAdminView = lazy(() => import('./views/ScrapingAdminView'))

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
            <Route
              path="/conversaciones"
              element={
                <ProtectedRoute>
                  <MisConversacionesView />
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
            <Route
              path="/admin/scraping"
              element={
                <ProtectedRoute roles={['admin']}>
                  <ScrapingAdminView />
                </ProtectedRoute>
              }
            />

            <Route path="*" element={<NoEncontrada />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  )
}
