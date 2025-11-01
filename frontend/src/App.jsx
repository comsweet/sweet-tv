import { HashRouter as Router, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Display from './pages/Display'
import Admin from './pages/Admin'
import Slideshow from './pages/Slideshow'
import SlideshowsList from './pages/SlideshowsList'
import AgentUpload from './pages/AgentUpload'
import './App.css'

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          {/* Login */}
          <Route path="/login" element={<Login />} />

          {/* Agent upload (publik sida med JWT token) */}
          <Route path="/upload/:token" element={<AgentUpload />} />

          {/* Startsida = Slideshow-lista (kräver inloggning) */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <SlideshowsList />
              </ProtectedRoute>
            }
          />

          {/* Admin (kräver admin eller superadmin) */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['superadmin', 'admin']}>
                <Admin />
              </ProtectedRoute>
            }
          />

          {/* Slideshow-lista (kräver inloggning) */}
          <Route
            path="/slideshow"
            element={
              <ProtectedRoute>
                <SlideshowsList />
              </ProtectedRoute>
            }
          />

          {/* Specifik slideshow (kräver inloggning) */}
          <Route
            path="/slideshow/:id"
            element={
              <ProtectedRoute>
                <Slideshow />
              </ProtectedRoute>
            }
          />

          {/* Display (kräver inloggning) */}
          <Route
            path="/display"
            element={
              <ProtectedRoute>
                <Display />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </Router>
  )
}

export default App
