import { Routes, Route } from 'react-router-dom'
import BarraSuperior from './components/BarraSuperior'
import ProtectedRoute from './components/ProtectedRoute'
import CiudadanoView from './views/CiudadanoView'
import LoginView from './views/LoginView'
import RegistroView from './views/RegistroView'
import MisReportesView from './views/MisReportesView'
import CentrosAcopioView from './views/CentrosAcopioView'
import InicioRedirect from './views/InicioRedirect'
import VoluntarioView from './views/VoluntarioView'
import PerfilView from './views/PerfilView'
import EditarPerfilView from './views/EditarPerfilView'
import HistorialView from './views/HistorialView'
// PAUSADO: la verificación se ocultó por ahora. El código se conserva para
// restaurarla en el futuro. Ver VerificadorView.tsx.
// import VerificadorView from './views/VerificadorView'
import AdminView from './views/AdminView'

export default function App() {
  return (
    <div className="h-full flex flex-col">
      <BarraSuperior />
      <main className="flex-1 min-h-0">
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

          {/* PAUSADO: verificación oculta por ahora (se conserva para el futuro)
          <Route
            path="/verificar"
            element={
              <ProtectedRoute roles={['verificador', 'admin']}>
                <VerificadorView />
              </ProtectedRoute>
            }
          />
          */}

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
      </main>
    </div>
  )
}
