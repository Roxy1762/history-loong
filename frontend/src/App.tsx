import { Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import Game from './pages/Game';
import Admin from './pages/Admin';

export default function App() {
  return (
    <Routes>
      <Route path="/"             element={<Home />} />
      <Route path="/game/:gameId" element={<Game />} />
      <Route path="/admin"        element={<Admin />} />
      <Route path="*"             element={<Navigate to="/" replace />} />
    </Routes>
  );
}
