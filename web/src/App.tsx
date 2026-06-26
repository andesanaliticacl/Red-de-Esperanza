import { Routes, Route } from 'react-router-dom'
import BarraSuperior from './components/BarraSuperior'
import ProtectedRoute from './components/ProtectedRoute'
import CiudadanoView from './views/CiudadanoView'
import LoginView from './views/LoginView'
import RegistroView from './views/RegistroView'
import MisReportesView from './views/MisReportesView'
import InicioRedirect from './views/InicioRedirect'
import VoluntarioView from './views/VoluntarioView'
import VerificadorView from './views/VerificadorView'
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

          {/* Verificador y admin */}
          <Route
            path="/verificar"
            element={
              <ProtectedRoute roles={['verificador', 'admin']}>
                <VerificadorView />
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
      </main>
    </div>
  )
}
