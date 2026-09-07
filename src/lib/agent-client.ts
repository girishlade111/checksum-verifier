/**
 * Thin client for the Express Agent API (`/api`, proxied to :3001 by Vite).
 *
 * Streaming uses `fetch` + `ReadableStream` rather than `EventSource`, because the SDK
 * bridge is a POST endpoint (EventSource can only issue GETs).
 */

import type {
  AgentMessage,
  AgentModel,
  AgentSession,
  AgentStreamEvent,
  PermissionMode,
} from '@/types';

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api';

async function jsonOrThrow<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    let detail = '';
    try {
      const body = (await response.json()) as { error?: string; message?: string };
      detail = body?.error || body?.message || '';
    } catch {
      /* non-JSON error body */
    }
    throw new Error(detail || `${fallbackMessage} (HTTP ${response.status})`);
  }
  return (await response.json()) as T;
}

export interface HealthResponse {
  status: string;
  timestamp: string;
}

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE}/health`, { signal });
  return jsonOrThrow<HealthResponse>(response, 'Agent backend unreachable');
}

export interface ModelsResponse {
  models: AgentModel[];
  defaultModel: string;
  error?: string;
}

export async function fetchModels(signal?: AbortSignal): Promise<ModelsResponse> {
  const response = await fetch(`${API_BASE}/models`, { signal });
  return jsonOrThrow<ModelsResponse>(response, 'Could not load models');
}

export async function listSessions(signal?: AbortSignal): Promise<AgentSession[]> {
  const response = await fetch(`${API_BASE}/sessions`, { signal });
  const data = await jsonOrThrow<{ sessions: AgentSession[] }>(response, 'Could not load sessions');
  return data.sessions ?? [];
}

export async function createSession(
  payload: { model: string; title?: string; id?: string },
  signal?: AbortSignal,
): Promise<AgentSession> {
  const response = await fetch(`${API_BASE}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
  const data = await jsonOrThrow<{ session: AgentSession }>(response, 'Could not create session');
  return data.session;
}

export async function deleteSession(sessionId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/sessions/${sessionId}`, { method: 'DELETE' });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Could not delete session (HTTP ${response.status})`);
  }
}

export interface SessionDetail {
  session: AgentSession;
  messages: AgentMessage[];
}

export async function fetchSession(
  sessionId: string,
  signal?: AbortSignal,
): Promise<SessionDetail> {
  const response = await fetch(`${API_BASE}/sessions/${sessionId}`, { signal });
  return jsonOrThrow<SessionDetail>(response, 'Could not load session');
}

export async function respondToPermission(
  requestId: string,
  behavior: 'allow' | 'deny',
  message?: string,
): Promise<void> {
  await fetch(`${API_BASE}/permission-response`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId, behavior, message }),
  });
}

export interface StreamChatParams {
  sessionId?: string | null;
  message: string;
  model?: string;
  systemPrompt?: string;
  permissionMode?: PermissionMode;
  signal?: AbortSignal;
  onEvent: (event: AgentStreamEvent) => void;
}

/**
 * POSTs a message and pumps the SSE frames through `onEvent`.
 * Resolves when the server closes the stream (or the caller aborts).
 */
export async function streamChat({
  sessionId,
  message,
  model,
  systemPrompt,
  permissionMode,
  signal,
  onEvent,
}: StreamChatParams): Promise<void> {
  const response = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, message, model, systemPrompt, permissionMode }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Agent backend error (HTTP ${response.status})`);
  }
  if (!response.body) {
    throw new Error('This browser does not support streaming responses.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line.
      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);

        const dataLine = frame.split('\n').find((line) => line.startsWith('data:'));
        if (dataLine) {
          try {
            onEvent(JSON.parse(dataLine.slice(5).trim()) as AgentStreamEvent);
          } catch {
            /* Ignore malformed frames rather than killing the stream. */
          }
        }

        boundary = buffer.indexOf('\n\n');
      }
    }
  } finally {
    reader.cancel().catch(() => undefined);
  }
}
