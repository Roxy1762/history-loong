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

export async function getGameMessages(
  id: string,
  options?: { limit?: number; offset?: number; includeArchived?: boolean }
) {
  const params = {
    limit: options?.limit,
    offset: options?.offset,
    includeArchived: options?.includeArchived ? 1 : 0,
  };
  const { data } = await api.get<{
    messages: Message[];
    archivedMessages?: Message[];
    pagination: { limit: number; offset: number; total: number; hasMore: boolean; archivedTotal?: number };
  }>(`/games/${id}/messages`, { params });
  return data;
}

export async function getGameModes() {
  const { data } = await api.get<{ modes: Record<string, GameModeConfig>; combinableModes: Record<string, GameModeConfig> }>('/modes');
  return data;
}

/** Import a previously exported JSON file to create a new restored game. */
export async function importGame(jsonData: unknown): Promise<{ game: Game; importedConcepts: number; importedMessages: number }> {
  const { data } = await api.post('/games/import', jsonData);
  return data as { game: Game; importedConcepts: number; importedMessages: number };
}

// ── Export ────────────────────────────────────────────────────────────────────

export async function exportGame(gameId: string, format: ExportFormat) {
  const response = await api.get(`/export/${gameId}`, {
    params: { format },
    responseType: 'blob',
  });
  const disposition = response.headers['content-disposition'] || '';
  // Support both filename= and filename*=UTF-8'' encodings
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;\n]+)/i);
  const plainMatch = disposition.match(/filename="?([^";\n]+)"?/i);
  const rawName = utf8Match ? decodeURIComponent(utf8Match[1]) : plainMatch?.[1];
  const filename = rawName ?? `history-loong-${gameId}.${format}`;

  // Re-create the blob with explicit charset so browsers don't misinterpret encoding
  const contentType = (response.headers['content-type'] as string) || 'application/octet-stream';
  const typedBlob = new Blob([response.data], { type: contentType });
  const url = URL.createObjectURL(typedBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  // Must be in DOM for Firefox/Safari to trigger the download
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Delay revoke so the browser has time to start the download
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
  provider_type: 'anthropic' | 'openai-compatible' | 'google' | string;
  base_url: string | null;
  api_key: string;
  model: string;
  is_active: number;
  extra: Record<string, unknown>;
  system_prompt?: string | null;
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

export async function adminVectorizeDoc(id: string) {
  const { data } = await api.post(`/admin/knowledge/${id}/vectorize`, {}, { headers: adminHeaders() });
  return data as { message: string; docId: string; chunks: number; vectorized: number };
}

export interface KnowledgeCheckPayload {
  enabled?: boolean;
  embeddingEnabled?: boolean;
  rerankEnabled?: boolean;
  apiKey?: string;
  baseUrl?: string;
  embeddingModel?: string;
  rerankModel?: string;
  rerankInstruction?: string;
}

export async function adminCheckEmbedding(knowledge?: KnowledgeCheckPayload) {
  const { data } = await api.post('/admin/knowledge/check/embedding', { knowledge }, { headers: adminHeaders() });
  return data as { message: string; ok: boolean; model: string; endpoint: string };
}

export async function adminCheckRerank(knowledge?: KnowledgeCheckPayload) {
  const { data } = await api.post('/admin/knowledge/check/rerank', { knowledge }, { headers: adminHeaders() });
  return data as { message: string; ok: boolean; model: string; endpoint: string; topResult?: string };
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

export async function adminUpdateGameNotes(id: string, notes: string) {
  const { data } = await api.put(`/admin/games/${id}/notes`, { notes }, { headers: adminHeaders() });
  return data as { message: string };
}

export async function adminUpdateGameSettings(id: string, settings: Record<string, unknown>) {
  const { data } = await api.put(`/admin/games/${id}/settings`, { settings }, { headers: adminHeaders() });
  return data as { message: string; settings: Record<string, unknown> };
}

export async function adminSetPlayerLives(gameId: string, playerId: string, lives: number) {
  const { data } = await api.post(`/admin/games/${gameId}/players/${playerId}/lives`, { lives }, { headers: adminHeaders() });
  return data as { message: string; playerId: string; lives: number };
}

export async function adminUpdateGameModes(id: string, mode: string, extraModes: string[]) {
  const { data } = await api.put(`/admin/games/${id}/modes`, { mode, extraModes }, { headers: adminHeaders() });
  return data as { message: string; game: AdminGame };
}

export async function adminRestoreGame(id: string) {
  const { data } = await api.post(`/admin/games/${id}/restore`, {}, { headers: adminHeaders() });
  return data as { message: string };
}

// ── Admin: AI-Confirmed Knowledge Base ───────────────────────────────────────

export interface AIConfirmedDoc {
  id: string;
  title: string;
  filename: string;
  total_chunks: number;
  created_at: string;
  source: 'ai_confirmed';
  game_id: string | null;
}

export async function adminListAIConfirmed() {
  const { data } = await api.get<{ docs: AIConfirmedDoc[] }>('/admin/ai-confirmed', { headers: adminHeaders() });
  return data.docs;
}

export async function adminDeleteAIConfirmed(id: string) {
  const { data } = await api.delete(`/admin/ai-confirmed/${id}`, { headers: adminHeaders() });
  return data;
}

export async function adminClearAIConfirmed() {
  const { data } = await api.delete('/admin/ai-confirmed', { headers: adminHeaders() });
  return data as { message: string };
}

// ── Admin: Knowledge Curation ────────────────────────────────────────────────

export interface Category {
  id: string;
  name: string;
  color: string;
  sort_order: number;
}

export interface CurationConcept {
  id: string;
  title: string;
  filename: string;
  total_chunks: number;
  source: string;
  game_id: string | null;
  status: 'draft' | 'active' | 'archived';
  created_at: string;
  categories: Category[];
  dynasty: string | null;
  period: string | null;
  year: number | null;
  description: string | null;
  tags: string[];
}

export async function adminGetCurationPending() {
  const { data } = await api.get<{ concepts: CurationConcept[] }>('/admin/curation/pending', { headers: adminHeaders() });
  return data.concepts;
}

export async function adminGetCurationActive(status = 'active') {
  const { data } = await api.get<{ concepts: CurationConcept[] }>('/admin/curation/concepts', {
    headers: adminHeaders(),
    params: { status },
  });
  return data.concepts;
}

export async function adminApproveConcept(id: string) {
  const { data } = await api.post(`/admin/curation/concepts/${id}/approve`, {}, { headers: adminHeaders() });
  return data;
}

export async function adminApproveAll() {
  const { data } = await api.post('/admin/curation/concepts/approve-all', {}, { headers: adminHeaders() });
  return data as { approved: number };
}

export async function adminArchiveConcept(id: string) {
  const { data } = await api.post(`/admin/curation/concepts/${id}/archive`, {}, { headers: adminHeaders() });
  return data;
}

export async function adminRejectConcept(id: string) {
  const { data } = await api.delete(`/admin/curation/concepts/${id}`, { headers: adminHeaders() });
  return data;
}

export async function adminEditConcept(id: string, patches: {
  title?: string; dynasty?: string | null; period?: string | null;
  year?: number | null; description?: string | null; tags?: string[];
}) {
  const { data } = await api.put(`/admin/curation/concepts/${id}`, patches, { headers: adminHeaders() });
  return data;
}

export async function adminMergeConcepts(keepId: string, mergeIds: string[]) {
  const { data } = await api.post('/admin/curation/concepts/merge', { keepId, mergeIds }, { headers: adminHeaders() });
  return data as { ok: boolean; kept: string; deleted: number };
}

export async function adminListCategories() {
  const { data } = await api.get<{ categories: Category[] }>('/admin/curation/categories', { headers: adminHeaders() });
  return data.categories;
}

export async function adminCreateCategory(name: string, color?: string, sortOrder?: number) {
  const { data } = await api.post('/admin/curation/categories', { name, color, sortOrder }, { headers: adminHeaders() });
  return data as Category;
}

export async function adminDeleteCategory(id: string) {
  const { data } = await api.delete(`/admin/curation/categories/${id}`, { headers: adminHeaders() });
  return data;
}

export async function adminCategorizeConcept(id: string, categoryId: string, remove = false) {
  const { data } = await api.post(`/admin/curation/concepts/${id}/categorize`, { categoryId, remove }, { headers: adminHeaders() });
  return data;
}

// ── Admin: AI Validation Audit ───────────────────────────────────────────────

export interface AIDecision {
  id: string;
  concept_id: string;
  game_id: string;
  validation_method: 'ai' | 'kb' | 'cache' | 'admin_override' | string;
  ai_prompt: string | null;
  ai_response: string | null;
  ai_provider: string | null;
  ai_model: string | null;
  decision_made_at: string;
  decision_ms: number | null;
  // joined from concepts
  name?: string | null;
  raw_input?: string | null;
  player_name?: string | null;
  validated?: number;
  rejected?: number;
}

export async function adminGetAIDecisions(gameId?: string) {
  const params = gameId ? { game_id: gameId } : {};
  const { data } = await api.get<{ decisions: AIDecision[] }>('/admin/audit', {
    headers: adminHeaders(),
    params,
  });
  return data.decisions;
}

export async function adminGetAIDecision(conceptId: string) {
  const { data } = await api.get<{ decision: AIDecision | null; override: unknown | null }>(
    `/admin/audit/${conceptId}`,
    { headers: adminHeaders() }
  );
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
