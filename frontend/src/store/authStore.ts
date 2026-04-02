import { create } from 'zustand';
import type { UserAccount } from '../services/api';
import { authGetMe, authLogin, authRegister, authUpdateMe, authChangePassword } from '../services/api';

const TOKEN_KEY = 'hl_auth_token';

interface AuthState {
  user: UserAccount | null;
  token: string | null;
  loading: boolean;

  // Actions
  init: () => Promise<void>;
  login: (username: string, password: string) => Promise<{ error?: string }>;
  register: (username: string, password: string) => Promise<{ error?: string }>;
  logout: () => void;
  updateProfile: (patches: Partial<Pick<UserAccount, 'nickname' | 'avatar_color' | 'avatar_emoji'>>) => Promise<{ error?: string }>;
  changePassword: (current: string, next: string) => Promise<{ error?: string }>;
  setUser: (user: UserAccount | null) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  loading: true,

  init: async () => {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (!saved) { set({ loading: false }); return; }
    const res = await authGetMe(saved);
    if ('error' in res) {
      localStorage.removeItem(TOKEN_KEY);
      set({ loading: false });
    } else {
      set({ user: res.user, token: saved, loading: false });
    }
  },

  login: async (username, password) => {
    const res = await authLogin(username, password);
    if ('error' in res) return { error: res.error };
    localStorage.setItem(TOKEN_KEY, res.token);
    set({ user: res.user, token: res.token });
    return {};
  },

  register: async (username, password) => {
    const res = await authRegister(username, password);
    if ('error' in res) return { error: res.error };
    localStorage.setItem(TOKEN_KEY, res.token);
    set({ user: res.user, token: res.token });
    return {};
  },

  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
    set({ user: null, token: null });
  },

  updateProfile: async (patches) => {
    const token = get().token;
    if (!token) return { error: '未登录' };
    const res = await authUpdateMe(token, patches);
    if ('error' in res) return { error: res.error };
    set({ user: res.user });
    return {};
  },

  changePassword: async (current, next) => {
    const token = get().token;
    if (!token) return { error: '未登录' };
    const res = await authChangePassword(token, current, next);
    if ('error' in res) return { error: res.error };
    return {};
  },

  setUser: (user) => set({ user }),
}));

// Auto-initialize on module load
useAuthStore.getState().init();
