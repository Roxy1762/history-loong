import { Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import Home from './pages/Home';
import Game from './pages/Game';

// Admin is heavy (AI config, knowledge base, logs) — lazy-load to cut initial bundle
const Admin = lazy(() => import('./pages/Admin'));

function AdminFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="text-slate-400 text-sm flex items-center gap-2">
        <span className="w-4 h-4 border-2 border-slate-600 border-t-slate-300 rounded-full animate-spin" />
        加载管理后台...
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/"             element={<Home />} />
      <Route path="/game/:gameId" element={<Game />} />
      <Route path="/admin"        element={
        <Suspense fallback={<AdminFallback />}>
          <Admin />
        </Suspense>
      } />
      <Route path="*"             element={<Navigate to="/" replace />} />
    </Routes>
  );
}
