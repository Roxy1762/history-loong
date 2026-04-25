import axios from 'axios';
import type { Game, Concept, Message, GameModeConfig, ExportFormat } from '../types';

const BASE = '/api';
const api = axios.create({ baseURL: BASE });

// ── Admin auth storage (dual mode: admin key OR account Bearer token) ─────────

let _adminKey   = localStorage.getItem('admin_key')   || '';
let _adminToken = localStorage.getItem('admin_token') || '';

/** Log in via admin key (clears any saved account token) */
export function setAdminKey(key: string) {
  _adminKey = key;
  localStorage.setItem('admin_key', key);
  _adminToken = '';
  localStorage.removeItem('admin_token');
}

/** Log in via account Bearer token (clears any saved admin key) */
export function setAdminToken(token: string) {
  _adminToken = token;
  localStorage.setItem('admin_token', token);
  _adminKey = '';
  localStorage.removeItem('admin_key');
}

export function getAdminKey()   { return _adminKey; }
export function getAdminToken() { return _adminToken; }

/** Clear all admin auth state (logout) */
export function clearAdminAuth() {
  _adminKey = '';
  _adminToken = '';
  localStorage.removeItem('admin_key');
  localStorage.removeItem('admin_token');
}

function adminHeaders(): Record<string, string> {
  if (_adminToken) return { Authorization: `Bearer ${_adminToken}` };
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
  const { data } = await api.get<{
    modes: Record<string, GameModeConfig>;
    combinableModes: Record<string, GameModeConfig>;
    ragDefaults?: Record<string, unknown>;
  }>('/modes');
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

// ── Admin: Identity & permissions ─────────────────────────────────────────────

export interface AdminMe {
  loginMode: 'key' | 'account';
  user: UserAccount | null;
  permissions: string[] | null; // null means full access (key or super_admin)
}

export async function adminGetMe(): Promise<AdminMe> {
  const { data } = await api.get('/admin/me', { headers: adminHeaders() });
  return data as AdminMe;
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
  provider_type: 'anthropic' | 'openai-compatible' | 'google' | 'deepseek' | string;
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
  vectorized_at?: string | null;
  chunk_strategy?: string;
}

export async function adminListDocs() {
  const { data } = await api.get<{ docs: KnowledgeDoc[] }>('/admin/knowledge', { headers: adminHeaders() });
  return data.docs;
}

export async function adminUploadDoc(file: File, title?: string, strategy?: string) {
  const form = new FormData();
  form.append('file', file);
  if (title) form.append('title', title);
  if (strategy) form.append('strategy', strategy);
  const { data } = await api.post('/admin/knowledge/upload', form, {
    headers: { ...adminHeaders(), 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function adminAddTextDoc(title: string, content: string, strategy?: string) {
  const { data } = await api.post('/admin/knowledge/text', { title, content, strategy }, { headers: adminHeaders() });
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

export async function adminRevectorizeDoc(id: string) {
  const { data } = await api.post(`/admin/knowledge/${id}/revectorize`, {}, { headers: adminHeaders() });
  return data as { message: string; docId: string; chunks: number; vectorized: number };
}

export async function adminRevectorizeAll() {
  const { data } = await api.post('/admin/knowledge/revectorize/all', {}, { headers: adminHeaders() });
  return data as { message: string; total: number; success: number; failed: number; errors: Array<{ id: string; title: string; error: string }> };
}

export async function adminRechunkDoc(id: string, options?: { strategy?: string; chunkSize?: number; chunkOverlap?: number }) {
  const { data } = await api.post(`/admin/knowledge/${id}/rechunk`, options || {}, { headers: adminHeaders() });
  return data as { message: string; docId: string; oldChunks: number; newChunks: number; strategy: string; chunkSize: number; chunkOverlap: number };
}

export async function adminGetChunkConfig() {
  const { data } = await api.get('/admin/knowledge/chunk-config', { headers: adminHeaders() });
  return data as { chunkSize: number; chunkOverlap: number; embedBatchSize: number };
}

export async function adminGetRagModes() {
  const { data } = await api.get('/admin/knowledge/rag/modes', { headers: adminHeaders() });
  return data as { modes: string[]; active: string };
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

export interface AuxiliaryCheckPayload {
  providerType?: string;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  systemPrompt?: string;
}

export async function adminCheckAuxiliary(auxiliary?: AuxiliaryCheckPayload) {
  const { data } = await api.post('/admin/knowledge/check/auxiliary', { auxiliary }, { headers: adminHeaders() });
  return data as { message: string; ok: boolean; provider: string; model: string; baseUrl: string; reply?: string };
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

export async function adminDeleteGameConcept(gameId: string, conceptId: string) {
  const { data } = await api.delete(`/admin/games/${gameId}/concepts/${conceptId}`, { headers: adminHeaders() });
  return data as { message: string; conceptId: string };
}

export async function adminUpdateGameConcept(gameId: string, conceptId: string, patches: {
  raw_input?: string;
  name?: string;
  dynasty?: string | null;
  period?: string | null;
  year?: number | null;
  description?: string | null;
  tags?: string[];
}) {
  const { data } = await api.put(`/admin/games/${gameId}/concepts/${conceptId}`, patches, { headers: adminHeaders() });
  return data as { message: string; concept: import('../types').Concept };
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
  rag_content: string | null;
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
  rag_content?: string | null;
}) {
  const { data } = await api.put(`/admin/curation/concepts/${id}`, patches, { headers: adminHeaders() });
  return data;
}

export async function adminConceptRAGSearch(id: string, query?: string, topN = 6) {
  const { data } = await api.post<{ ok: boolean; query: string; context: string; trace: unknown }>
    (`/admin/curation/concepts/${id}/rag-search`, { query, topN }, { headers: adminHeaders() });
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

export async function adminCategorizeConceptsBatch(conceptIds: string[], categoryId: string, remove = false) {
  const { data } = await api.post('/admin/curation/concepts/categorize-batch', { conceptIds, categoryId, remove }, { headers: adminHeaders() });
  return data as { ok: boolean; affected: number };
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

// ── User accounts ─────────────────────────────────────────────────────────────

export interface UserAccount {
  id: string;
  uid: number | null;
  username: string;
  nickname: string | null;
  avatar_color: string;
  avatar_emoji: string;
  avatar_type: 'text' | 'emoji' | 'image';
  avatar_url: string | null;
  role: string;
  status: string;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
  login_count: number;
  username_changed_at: string | null;
}

export interface AdminUserDetail extends UserAccount {
  role: string;
  status: string;
  ban_reason: string | null;
  gameCount: number;
  conceptCount: number;
  acceptedCount: number;
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export async function authRegister(username: string, password: string) {
  try {
    const { data } = await api.post<{ user: UserAccount; token: string }>('/auth/register', { username, password });
    return data;
  } catch (e: unknown) {
    const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || '注册失败';
    return { error: msg } as { error: string };
  }
}

export async function authLogin(username: string, password: string) {
  try {
    const { data } = await api.post<{ user: UserAccount; token: string }>('/auth/login', { username, password });
    return data;
  } catch (e: unknown) {
    const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || '登录失败';
    return { error: msg } as { error: string };
  }
}

export async function authGetMe(token: string) {
  try {
    const { data } = await api.get<{ user: UserAccount }>('/auth/me', { headers: authHeaders(token) });
    return data;
  } catch {
    return { error: '登录已过期' } as { error: string };
  }
}

export async function authUpdateMe(token: string, patches: Partial<Pick<UserAccount, 'nickname' | 'avatar_color' | 'avatar_emoji' | 'avatar_type'>>) {
  try {
    const { data } = await api.patch<{ user: UserAccount }>('/auth/me', patches, { headers: authHeaders(token) });
    return data;
  } catch (e: unknown) {
    const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || '更新失败';
    return { error: msg } as { error: string };
  }
}

export async function authChangePassword(token: string, currentPassword: string, newPassword: string) {
  try {
    const { data } = await api.post<{ ok: boolean }>('/auth/change-password', { currentPassword, newPassword }, { headers: authHeaders(token) });
    return data;
  } catch (e: unknown) {
    const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || '修改失败';
    return { error: msg } as { error: string };
  }
}

export async function authUploadAvatar(token: string, file: File) {
  try {
    const form = new FormData();
    form.append('avatar', file);
    const { data } = await api.post<{ user: UserAccount }>('/auth/avatar', form, {
      headers: { ...authHeaders(token), 'Content-Type': 'multipart/form-data' },
    });
    return data;
  } catch (e: unknown) {
    const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || '上传失败';
    return { error: msg } as { error: string };
  }
}

export async function authDeleteAvatar(token: string) {
  try {
    const { data } = await api.delete<{ user: UserAccount }>('/auth/avatar', { headers: authHeaders(token) });
    return data;
  } catch (e: unknown) {
    const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || '删除失败';
    return { error: msg } as { error: string };
  }
}

export async function adminListUsers(search?: string) {
  const params = search ? { search } : {};
  const { data } = await api.get<{ users: AdminUserDetail[] }>('/admin/users', { headers: adminHeaders(), params });
  return data.users;
}

export async function adminGetUser(userId: string) {
  const { data } = await api.get<{ user: AdminUserDetail }>(`/admin/users/${userId}`, { headers: adminHeaders() });
  return data.user;
}

export async function adminUpdateUser(userId: string, payload: { username?: string; nickname?: string; uid?: number }) {
  const { data } = await api.put<{ user: UserAccount }>(`/admin/users/${userId}`, payload, { headers: adminHeaders() });
  return data;
}

export async function adminGetUserGames(userId: string) {
  const { data } = await api.get<{ games: Array<{ id: string; topic: string; mode: string; status: string; created_at: string; user_concepts: number; user_accepted: number }> }>(`/admin/users/${userId}/games`, { headers: adminHeaders() });
  return data.games;
}

export async function adminGetUserConcepts(userId: string, status?: string) {
  const params = status ? { status } : {};
  const { data } = await api.get<{ concepts: Array<Concept & { game_topic?: string }> }>(`/admin/users/${userId}/concepts`, { headers: adminHeaders(), params });
  return data.concepts;
}

export async function adminResetUserPassword(userId: string, newPassword?: string) {
  const body = newPassword ? { newPassword } : {};
  const { data } = await api.post(`/admin/users/${userId}/reset-password`, body, { headers: adminHeaders() });
  return data as { ok: boolean };
}

export async function adminDeleteUser(userId: string) {
  const { data } = await api.delete(`/admin/users/${userId}`, { headers: adminHeaders() });
  return data as { ok: boolean };
}

export async function adminClearUsernameCooldown(userId: string) {
  const { data } = await api.post<{ ok: boolean; user: UserAccount }>(`/admin/users/${userId}/clear-username-cooldown`, {}, { headers: adminHeaders() });
  return data;
}

export async function adminGetSettings() {
  const { data } = await api.get<{ settings: Record<string, string> }>('/admin/settings', { headers: adminHeaders() });
  return data.settings;
}

export async function adminSetSetting(key: string, value: string) {
  const { data } = await api.put<{ ok: boolean; key: string; value: string }>(`/admin/settings/${key}`, { value }, { headers: adminHeaders() });
  return data;
}

export async function getAuthSettings() {
  const { data } = await api.get<{ cooldownDays: number }>('/auth/settings/username-cooldown');
  return data;
}


// ── Security configuration ────────────────────────────────────────────────────

export async function adminGetSecurity() {
  const { data } = await api.get<{
    adminKeySource: string; adminKeyMasked: string;
    jwtSecretSource: string; jwtSecretMasked: string;
  }>('/admin/security', { headers: adminHeaders() });
  return data;
}

export async function adminSetAdminKey(newKey: string) {
  const { data } = await api.post<{ ok: boolean; masked: string }>('/admin/security/admin-key', { newKey }, { headers: adminHeaders() });
  return data;
}

export async function adminSetJwtSecret(newSecret: string) {
  const { data } = await api.post<{ ok: boolean; note: string; masked: string }>('/admin/security/jwt-secret', { newSecret }, { headers: adminHeaders() });
  return data;
}

// ── User role management ──────────────────────────────────────────────────────

export async function adminSetUserStatus(userId: string, status: string, reason?: string) {
  try {
    const { data } = await api.put<{ ok: boolean; status: string; reason: string | null }>(`/admin/users/${userId}/status`, { status, reason }, { headers: adminHeaders() });
    return data;
  } catch (e: unknown) {
    const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || '操作失败';
    return { error: msg } as { error: string };
  }
}

export async function adminSetUserRole(userId: string, role: string) {
  try {
    const { data } = await api.put<{ ok: boolean; role: string }>(`/admin/users/${userId}/role`, { role }, { headers: adminHeaders() });
    return data;
  } catch (e: unknown) {
    const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || '设置角色失败';
    return { error: msg } as { error: string };
  }
}

export async function adminGetAdminUsers() {
  const { data } = await api.get<{ admins: Array<{ id: string; username: string; nickname: string | null; role: string; avatar_emoji: string; avatar_color: string }> }>('/admin/users/admins', { headers: adminHeaders() });
  return data.admins;
}

// ── Admin: Avatar Management ──────────────────────────────────────────────────

export interface AvatarFileInfo {
  filename: string;
  url: string;
  size: number;
  modified_at: string;
  user_id: string;
  username: string | null;
  nickname: string | null;
}

export interface AvatarConfig {
  maxSizeMb: number;
  allowedFormats: string[];
  enabled: boolean;
}

export async function adminListAvatars() {
  const { data } = await api.get<{ avatars: AvatarFileInfo[]; dir: string; count: number }>('/admin/avatars', { headers: adminHeaders() });
  return data;
}

export async function adminGetAvatarConfig() {
  const { data } = await api.get<AvatarConfig>('/admin/avatar-config', { headers: adminHeaders() });
  return data;
}

export async function adminSetAvatarConfig(config: Partial<AvatarConfig>) {
  const { data } = await api.put<{ ok: boolean; config: AvatarConfig }>('/admin/avatar-config', config, { headers: adminHeaders() });
  return data;
}

export async function adminUploadUserAvatar(userId: string, file: File) {
  const form = new FormData();
  form.append('avatar', file);
  const { data } = await api.post<{ ok: boolean; user: AdminUserDetail }>(`/admin/users/${userId}/avatar`, form, {
    headers: { ...adminHeaders(), 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function adminDeleteUserAvatar(userId: string) {
  const { data } = await api.delete<{ ok: boolean; user: AdminUserDetail }>(`/admin/users/${userId}/avatar`, { headers: adminHeaders() });
  return data;
}

export async function adminCreateUser(payload: { username: string; password: string; nickname?: string; role?: string }) {
  const { data } = await api.post<{ ok: boolean; user: AdminUserDetail }>('/admin/users', payload, { headers: adminHeaders() });
  return data;
}

// ── Admin: User Groups ────────────────────────────────────────────────────────

export interface UserGroupMember {
  id: string;
  uid: number;
  username: string;
  nickname: string | null;
  role: string;
  status: string;
}

export interface UserGroup {
  id: string;
  name: string;
  description: string;
  color: string;
  created_at: string;
  updated_at: string;
  permissions: string[];
  member_count?: number;
  members?: UserGroupMember[];
}

/** [id, section, action, label, description] */
export type PermissionDef = [string, string, string, string, string];

export async function adminListGroups() {
  const { data } = await api.get<{ groups: UserGroup[]; permissions: PermissionDef[] }>('/admin/groups', { headers: adminHeaders() });
  return data;
}

export async function adminGetGroup(id: string) {
  const { data } = await api.get<{ group: UserGroup }>(`/admin/groups/${id}`, { headers: adminHeaders() });
  return data.group;
}

export async function adminCreateGroup(payload: { name: string; description?: string; color?: string; permissions?: string[] }) {
  const { data } = await api.post<{ group: UserGroup }>('/admin/groups', payload, { headers: adminHeaders() });
  return data.group;
}

export async function adminUpdateGroup(id: string, payload: { name?: string; description?: string; color?: string; permissions?: string[] }) {
  const { data } = await api.put<{ group: UserGroup }>(`/admin/groups/${id}`, payload, { headers: adminHeaders() });
  return data.group;
}

export async function adminDeleteGroup(id: string) {
  const { data } = await api.delete(`/admin/groups/${id}`, { headers: adminHeaders() });
  return data;
}

export async function adminAddGroupMember(groupId: string, userId: string) {
  const { data } = await api.post(`/admin/groups/${groupId}/members`, { userId }, { headers: adminHeaders() });
  return data;
}

export async function adminRemoveGroupMember(groupId: string, userId: string) {
  const { data } = await api.delete(`/admin/groups/${groupId}/members/${userId}`, { headers: adminHeaders() });
  return data;
}
