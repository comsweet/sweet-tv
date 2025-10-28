import { HashRouter as Router, Routes, Route } from 'react-router-dom'
import Display from './pages/Display'
import Admin from './pages/Admin'
import Slideshow from './pages/Slideshow'
import './App.css'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Display />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/slideshow/:id" element={<Slideshow />} />
      </Routes>
    </Router>
  )
}

export default App
