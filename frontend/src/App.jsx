import { HashRouter as Router, Routes, Route } from 'react-router-dom'
import Display from './pages/Display'
import Admin from './pages/Admin'
import Slideshow from './pages/Slideshow'
import SlideshowsList from './pages/SlideshowsList'  // 🆕 NY IMPORT
import './App.css'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Display />} />
        <Route path="/admin" element={<Admin />} />
        {/* 🆕 NY: Översiktssida för alla slideshows */}
        <Route path="/slideshow" element={<SlideshowsList />} />
        {/* Befintlig: Specifik slideshow med ID */}
        <Route path="/slideshow/:id" element={<Slideshow />} />
      </Routes>
    </Router>
  )
}

export default App
