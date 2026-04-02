import { useState } from 'react';
import { useAuthStore } from '../store/authStore';

interface Props {
  onClose: () => void;
  defaultTab?: 'login' | 'register';
}

export default function LoginModal({ onClose, defaultTab = 'login' }: Props) {
  const [tab, setTab] = useState<'login' | 'register'>(defaultTab);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login, register } = useAuthStore();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = tab === 'login'
      ? await login(username.trim(), password)
      : await register(username.trim(), password);
    setLoading(false);
    if (result.error) { setError(result.error); return; }
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
      style={{ background: 'rgba(10,8,5,0.55)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="rounded-2xl shadow-2xl w-full max-w-sm p-7 animate-spring-in"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
      >
        {/* Logo */}
        <div className="text-center mb-6">
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl font-heading font-black mx-auto mb-3 text-white shadow-md"
            style={{ background: 'var(--brand)' }}
          >龙</div>
          <h2 className="text-xl font-heading font-bold" style={{ color: 'var(--text-primary)' }}>历史接龙账号</h2>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>登录后可跨设备识别、免填昵称</p>
        </div>

        {/* Tabs */}
        <div className="flex rounded-xl overflow-hidden mb-5" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border-subtle)' }}>
          {(['login', 'register'] as const).map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(''); }}
              className="flex-1 py-2 text-sm font-medium transition-all"
              style={{
                background: tab === t ? 'var(--brand)' : 'transparent',
                color: tab === t ? '#fff' : 'var(--text-muted)',
                borderRadius: tab === t ? '10px' : '0',
              }}
            >
              {t === 'login' ? '登录' : '注册'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            className="input w-full"
            placeholder="用户名"
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoFocus
            maxLength={30}
            autoComplete="username"
          />
          <input
            className="input w-full"
            type="password"
            placeholder={tab === 'register' ? '密码（至少 6 位）' : '密码'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            maxLength={64}
            autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
          />

          {error && (
            <p className="text-xs text-center py-1.5 px-3 rounded-lg" style={{ color: 'var(--seal-red)', background: 'color-mix(in srgb, var(--seal-red) 10%, transparent)' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full py-3 font-heading disabled:opacity-60"
          >
            {loading ? '处理中…' : tab === 'login' ? '登录' : '注册'}
          </button>
        </form>

        {tab === 'register' && (
          <p className="text-xs text-center mt-3" style={{ color: 'var(--text-muted)' }}>
            注册为可选功能，不注册也可正常游戏
          </p>
        )}

        <button
          onClick={onClose}
          className="w-full mt-3 py-2 text-xs rounded-xl transition-colors"
          style={{ color: 'var(--text-muted)', background: 'var(--bg-muted)' }}
        >
          暂不登录，继续游戏
        </button>
      </div>
    </div>
  );
}
