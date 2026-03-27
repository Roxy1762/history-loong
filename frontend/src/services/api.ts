import axios from 'axios';
import type { Game, Concept, Message, GameModeConfig, ExportFormat } from '../types';

const BASE = '/api';

const api = axios.create({ baseURL: BASE });

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

// ── Modes ─────────────────────────────────────────────────────────────────────

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

  // Trigger browser download
  const disposition = response.headers['content-disposition'] || '';
  const match = disposition.match(/filename="?([^";\n]+)"?/);
  const filename = match?.[1] ?? `history-loong-${gameId}.${format}`;

  const url = URL.createObjectURL(response.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function getExportFormats() {
  const { data } = await api.get<{ formats: string[] }>('/export/formats/list');
  return data.formats;
}
