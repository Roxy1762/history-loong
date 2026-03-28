import axios from 'axios';
import type { Game, Concept, Message, GameModeConfig, ExportFormat } from '../types';

const BASE = '/api';
const api = axios.create({ baseURL: BASE });

// ── Admin key storage ─────────────────────────────────────────────────────────

let _adminKey = localStorage.getItem('admin_key') || '';

export function setAdminKey(key: string) {
  _adminKey = key;
  localStorage.setItem('admin_key', key);
}
export function getAdminKey() { return _adminKey; }

function adminHeaders() {
  return { 'x-admin-key': _adminKey };
}

// ── Games ─────────────────────────────────────────────────────────────────────

export async function createGame(topic: string, mode = 'free', settings = {}) {
  const { data } = await api.post<{ game: Game }>('/games', { topic, mode, settings });
  return data.game;
}

export async function getGame(id: string) {
  const { data } = await api.get<{ game: Game; players: unknown[]; conceptCount: number }>(`/games/${id}`);
  return data;
}

export async function getGameConcepts(id: string) {
  const { data } = await api.get<{ concepts: Concept[] }>(`/games/${id}/concepts`);
  return data.concepts;
}

export async function getGameMessages(id: string) {
  const { data } = await api.get<{ messages: Message[] }>(`/games/${id}/messages`);
  return data.messages;
}

export async function getGameModes() {
  const { data } = await api.get<{ modes: Record<string, GameModeConfig> }>('/modes');
  return data.modes;
}

// ── Export ────────────────────────────────────────────────────────────────────

export async function exportGame(gameId: string, format: ExportFormat) {
  const response = await api.get(`/export/${gameId}`, {
    params: { format },
    responseType: 'blob',
  });
  const disposition = response.headers['content-disposition'] || '';
  const match = disposition.match(/filename="?([^";\n]+)"?/);
  const filename = match?.[1] ?? `history-loong-${gameId}.${format}`;
  const url = URL.createObjectURL(response.data);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export async function getExportFormats() {
  const { data } = await api.get<{ formats: string[] }>('/export/formats/list');
  return data.formats;
}

// ── Admin: Stats ──────────────────────────────────────────────────────────────

export async function adminGetStats() {
  const { data } = await api.get('/admin/stats', { headers: adminHeaders() });
  return data as { stats: Record<string, number>; recentGames: Game[] };
}

// ── Admin: AI Configs ─────────────────────────────────────────────────────────

export interface AIConfig {
  id: string;
  name: string;
  provider_type: 'anthropic' | 'openai-compatible' | string;
  base_url: string | null;
  api_key: string;
  model: string;
  is_active: number;
  extra: Record<string, unknown>;
  created_at: string;
}

export async function adminListAIConfigs() {
  const { data } = await api.get<{ configs: AIConfig[] }>('/admin/ai-configs', { headers: adminHeaders() });
  return data.configs;
}

export async function adminCreateAIConfig(payload: Omit<AIConfig, 'id' | 'is_active' | 'created_at'>) {
  const { data } = await api.post('/admin/ai-configs', payload, { headers: adminHeaders() });
  return data;
}

export async function adminUpdateAIConfig(id: string, payload: Partial<AIConfig>) {
  const { data } = await api.put(`/admin/ai-configs/${id}`, payload, { headers: adminHeaders() });
  return data;
}

export async function adminActivateAIConfig(id: string) {
  const { data } = await api.post(`/admin/ai-configs/${id}/activate`, {}, { headers: adminHeaders() });
  return data;
}

export async function adminTestAIConfig(id: string, apiKey?: string) {
  const { data } = await api.post(`/admin/ai-configs/${id}/test`, { api_key: apiKey }, { headers: adminHeaders() });
  return data as { ok: boolean; reply?: string; error?: string };
}

export async function adminDeleteAIConfig(id: string) {
  const { data } = await api.delete(`/admin/ai-configs/${id}`, { headers: adminHeaders() });
  return data;
}

// ── Admin: Knowledge Base ─────────────────────────────────────────────────────

export interface KnowledgeDoc {
  id: string;
  title: string;
  filename: string;
  total_chunks: number;
  created_at: string;
}

export async function adminListDocs() {
  const { data } = await api.get<{ docs: KnowledgeDoc[] }>('/admin/knowledge', { headers: adminHeaders() });
  return data.docs;
}

export async function adminUploadDoc(file: File, title?: string) {
  const form = new FormData();
  form.append('file', file);
  if (title) form.append('title', title);
  const { data } = await api.post('/admin/knowledge/upload', form, {
    headers: { ...adminHeaders(), 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function adminAddTextDoc(title: string, content: string) {
  const { data } = await api.post('/admin/knowledge/text', { title, content }, { headers: adminHeaders() });
  return data;
}

export async function adminDeleteDoc(id: string) {
  const { data } = await api.delete(`/admin/knowledge/${id}`, { headers: adminHeaders() });
  return data;
}

// ── Admin: Game Management ───────────────────────────────────────────────────

export interface AdminGame extends Game {
  settings: Record<string, unknown>;
  conceptCount: number;
  playerCount: number;
  pendingCount: number;
  onlineCount: number;  // live connected players (in-memory)
}

export interface AdminGameDetail {
  game: Game & { settings: Record<string, unknown> };
  concepts: import('../types').Concept[];
  players: import('../types').Player[];
  messageCount: number;
}

export async function adminListGames(status?: string) {
  const params = status ? { status } : {};
  const { data } = await api.get<{ games: AdminGame[] }>('/admin/games', { headers: adminHeaders(), params });
  return data.games;
}

export async function adminGetGame(id: string) {
  const { data } = await api.get<AdminGameDetail>(`/admin/games/${id}`, { headers: adminHeaders() });
  return data;
}

export async function adminFinishGame(id: string) {
  const { data } = await api.post(`/admin/games/${id}/finish`, {}, { headers: adminHeaders() });
  return data;
}

export async function adminDeleteGame(id: string) {
  const { data } = await api.delete(`/admin/games/${id}`, { headers: adminHeaders() });
  return data;
}

// ── Admin: Server Logs ───────────────────────────────────────────────────────

export interface LogEntry {
  ts: string;
  level: 'info' | 'warn' | 'error';
  msg: string;
}

export async function adminGetLogs(limit = 200, level?: string) {
  const params: Record<string, string | number> = { limit };
  if (level) params.level = level;
  const { data } = await api.get<{ count: number; logs: LogEntry[] }>('/admin/logs', {
    headers: adminHeaders(),
    params,
  });
  return data;
}
