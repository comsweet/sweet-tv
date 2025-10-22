import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Display from './pages/Display'
import Admin from './pages/Admin'
import './App.css'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Display />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </Router>
  )
}

export default App
