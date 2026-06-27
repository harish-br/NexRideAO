import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AdminControlPage from './pages/AdminControlPage'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/admin/bus-data-control" element={<AdminControlPage />} />
        {/* Redirect root to admin page for convenience during dev */}
        <Route path="*" element={<Navigate to="/admin/bus-data-control" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
