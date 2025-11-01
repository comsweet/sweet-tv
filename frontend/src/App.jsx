import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
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
          {/* Login page */}
          <Route path="/login" element={<Login />} />

          {/* Agent upload (public sida med JWT token) */}
          <Route path="/upload/:token" element={<AgentUpload />} />

          {/* Slideshow pages (public - ingen auth krävs nu, TV codes används istället) */}
          <Route path="/slideshow" element={<SlideshowsList />} />
          <Route path="/slideshow/:id" element={<Slideshow />} />

          {/* Protected Admin route (kräver admin eller superadmin) */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute requireAdmin={true}>
                <Admin />
              </ProtectedRoute>
            }
          />

          {/* Display (om du någonsin behöver den) */}
          <Route
            path="/display"
            element={
              <ProtectedRoute>
                <Display />
              </ProtectedRoute>
            }
          />

          {/* Root redirect */}
          <Route path="/" element={<Navigate to="/slideshow" replace />} />

          {/* 404 - redirect to slideshow list */}
          <Route path="*" element={<Navigate to="/slideshow" replace />} />
        </Routes>
      </AuthProvider>
    </Router>
  )
}

export default App
