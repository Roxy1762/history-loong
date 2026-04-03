import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import LoginModal from './LoginModal';
import AvatarDisplay from './AvatarDisplay';

interface Props {
  compact?: boolean; // smaller icon-only mode for game header
}

export default function UserMenu({ compact = false }: Props) {
  const { user, logout, loading } = useAuthStore();
  const [showLogin, setShowLogin] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (loading) return null;

  const displayName = user?.nickname || user?.username || '';

  if (!user) {
    return (
      <>
        <button
          onClick={() => setShowLogin(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors"
          style={{ background: 'var(--bg-muted)', color: 'var(--brand)', border: '1px solid var(--border-subtle)' }}
          title="登录 / 注册"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          {!compact && <span>登录</span>}
        </button>
        {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
      </>
    );
  }

  return (
    <div className="relative" ref={dropRef}>
      <button
        onClick={() => setShowDropdown(v => !v)}
        className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl text-xs font-medium transition-colors"
        style={{ background: 'var(--bg-muted)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }}
        title={displayName}
      >
        <AvatarDisplay
          type="user"
          avatarType={user?.avatar_type}
          avatarUrl={user?.avatar_url}
          avatarEmoji={user?.avatar_emoji}
          avatarColor={user?.avatar_color}
          name={displayName}
          size={20}
        />
        {!compact && <span className="max-w-[80px] truncate">{displayName}</span>}
        <svg className={`w-3 h-3 transition-transform ${showDropdown ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: 'var(--text-muted)' }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {showDropdown && (
        <div
          className="absolute right-0 top-full mt-1.5 rounded-xl shadow-xl z-50 min-w-[150px] py-1.5 animate-slide-down"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
        >
          <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
            <div className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{displayName}</div>
            <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>@{user.username}</div>
          </div>
          <button
            className="w-full text-left px-3 py-2 text-sm transition-colors hover:bg-[var(--bg-muted)]"
            style={{ color: 'var(--text-secondary)' }}
            onClick={() => { setShowDropdown(false); navigate('/profile'); }}
          >
            个人主页
          </button>
          <button
            className="w-full text-left px-3 py-2 text-sm transition-colors hover:bg-[var(--bg-muted)]"
            style={{ color: 'var(--seal-red)' }}
            onClick={() => { setShowDropdown(false); logout(); }}
          >
            退出登录
          </button>
        </div>
      )}
    </div>
  );
}
