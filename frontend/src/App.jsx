import { HashRouter as Router, Routes, Route } from 'react-router-dom'
import Display from './pages/Display'
import Admin from './pages/Admin'
import Slideshow from './pages/Slideshow'
import SlideshowsList from './pages/SlideshowsList'
import AgentUpload from './pages/AgentUpload'
import './App.css'

function App() {
  return (
    <Router>
      <Routes>
        {/* Startsida = Slideshow-lista */}
        <Route path="/" element={<SlideshowsList />} />
        
        {/* Admin */}
        <Route path="/admin" element={<Admin />} />
        
        {/* Slideshow-lista (samma som startsida) */}
        <Route path="/slideshow" element={<SlideshowsList />} />
        
        {/* Specifik slideshow */}
        <Route path="/slideshow/:id" element={<Slideshow />} />

        {/* Display (om du någonsin behöver den) */}
        <Route path="/display" element={<Display />} />

        {/* Agent upload (publik sida med JWT token) */}
        <Route path="/upload/:token" element={<AgentUpload />} />
      </Routes>
    </Router>
  )
}

export default App
