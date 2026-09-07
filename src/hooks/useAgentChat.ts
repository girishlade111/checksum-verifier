import { useCallback, useEffect, useRef, useState } from 'react';

import * as api from '@/lib/agent-client';
import { createId } from '@/lib/utils';
import type {
  AgentMessage,
  AgentModel,
  AgentSession,
  AgentToolCall,
  PermissionMode,
  StreamPermissionEvent,
} from '@/types';

export type AgentStatus = 'checking' | 'offline' | 'ready' | 'streaming';

const FALLBACK_MODELS: AgentModel[] = [
  { modelId: 'claude-sonnet-4', name: 'Claude Sonnet 4' },
  { modelId: 'claude-opus-4', name: 'Claude Opus 4' },
];

export interface UseAgentChatResult {
  status: AgentStatus;
  error: string | null;
  models: AgentModel[];
  model: string;
  setModel: (model: string) => void;
  sessions: AgentSession[];
  sessionId: string | null;
  messages: AgentMessage[];
  pendingPermission: StreamPermissionEvent | null;
  /** Name of the tool currently executing, for the "thinking" indicator. */
  activity: string | null;
  permissionMode: PermissionMode;
  setPermissionMode: (mode: PermissionMode) => void;
  send: (text: string) => Promise<void>;
  stop: () => void;
  newChat: () => void;
  selectSession: (id: string) => Promise<void>;
  removeSession: (id: string) => Promise<void>;
  resolvePermission: (allow: boolean) => void;
  clearError: () => void;
}

/**
 * React binding for the CodeBuddy Agent SDK bridge.
 *
 * The backend is optional: when `/api/health` cannot be reached the app stays fully
 * usable (hashing is 100% client-side) and the panel reports the backend as offline.
 */
export function useAgentChat(): UseAgentChatResult {
  const [status, setStatus] = useState<AgentStatus>('checking');
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<AgentModel[]>(FALLBACK_MODELS);
  const [model, setModelState] = useState<string>('claude-sonnet-4');
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [pendingPermission, setPendingPermission] = useState<StreamPermissionEvent | null>(null);
  const [activity, setActivity] = useState<string | null>(null);
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('default');

  const controllerRef = useRef<AbortController | null>(null);
  const aliveRef = useRef(true);
  /** Assistant message id currently being streamed into. */
  const streamIdRef = useRef<string | null>(null);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      controllerRef.current?.abort();
    };
  }, []);

  const refreshSessions = useCallback(async (signal?: AbortSignal) => {
    try {
      const list = await api.listSessions(signal);
      if (aliveRef.current) setSessions(list);
    } catch {
      /* The session list is incidental; never block the UI on it. */
    }
  }, []);

  /* ------------------------------ bootstrapping ----------------------------- */

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        await api.fetchHealth(controller.signal);
        if (!aliveRef.current) return;

        const modelData = await api.fetchModels(controller.signal);
        if (!aliveRef.current) return;

        if (modelData.models?.length) {
          setModels(modelData.models);
          if (modelData.defaultModel) setModelState(modelData.defaultModel);
        }
        setStatus('ready');
        await refreshSessions(controller.signal);
      } catch {
        if (aliveRef.current) setStatus('offline');
      }
    })();

    return () => controller.abort();
  }, [refreshSessions]);

  /* -------------------------------- streaming ------------------------------- */

  const patchAssistant = useCallback((patch: (message: AgentMessage) => AgentMessage) => {
    setMessages((current) => {
      const id = streamIdRef.current;
      if (!id) return current;
      return current.map((message) => (message.id === id ? patch(message) : message));
    });
  }, []);

  const finishStreaming = useCallback(() => {
    patchAssistant((message) => ({ ...message, streaming: false }));
    streamIdRef.current = null;
    setActivity(null);
    if (aliveRef.current) setStatus('ready');
  }, [patchAssistant]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || status === 'streaming' || status === 'offline') return;

      setError(null);

      let activeSessionId = sessionId;
      try {
        if (!activeSessionId) {
          const created = await api.createSession({ model, title: trimmed.slice(0, 40) });
          activeSessionId = created.id;
          setSessionId(created.id);
          void refreshSessions();
        }
      } catch {
        // Creating a session is an optimisation; the chat endpoint creates one anyway.
      }

      const userMessage: AgentMessage = {
        id: createId('u'),
        role: 'user',
        content: trimmed,
        createdAt: new Date().toISOString(),
      };
      const assistantMessage: AgentMessage = {
        id: createId('a'),
        role: 'assistant',
        content: '',
        model,
        createdAt: new Date().toISOString(),
        streaming: true,
        toolCalls: [],
      };

      streamIdRef.current = assistantMessage.id;
      setMessages((current) => [...current, userMessage, assistantMessage]);
      setStatus('streaming');

      const controller = new AbortController();
      controllerRef.current = controller;

      try {
        await api.streamChat({
          sessionId: activeSessionId,
          message: trimmed,
          model,
          permissionMode,
          signal: controller.signal,
          onEvent: (event) => {
            if (!aliveRef.current) return;

            switch (event.type) {
              case 'init':
                setSessionId(event.sessionId);
                break;

              case 'text':
                patchAssistant((message) => ({
                  ...message,
                  content: message.content + event.content,
                }));
                break;

              case 'tool': {
                const call: AgentToolCall = {
                  id: event.id,
                  name: event.name,
                  input: event.input,
                  status: event.status,
                };
                setActivity(event.name);
                patchAssistant((message) => ({
                  ...message,
                  toolCalls: [...(message.toolCalls ?? []), call],
                }));
                break;
              }

              case 'tool_result':
                setActivity(null);
                patchAssistant((message) => ({
                  ...message,
                  toolCalls: (message.toolCalls ?? []).map((call) =>
                    call.id === event.toolId
                      ? { ...call, status: event.isError ? 'error' : 'completed', result: event.content }
                      : call,
                  ),
                }));
                break;

              case 'permission_request':
                setPendingPermission(event);
                break;

              case 'error':
                setError(event.message);
                break;

              case 'done':
                break;

              default:
                break;
            }
          },
        });
      } catch (caught) {
        if (!aliveRef.current) return;
        if ((caught as Error)?.name !== 'AbortError') {
          setError(caught instanceof Error ? caught.message : 'The agent stream failed.');
          setStatus('offline');
        }
      } finally {
        controllerRef.current = null;
        if (aliveRef.current) finishStreaming();
        void refreshSessions();
      }
    },
    [finishStreaming, model, patchAssistant, permissionMode, refreshSessions, sessionId, status],
  );

  const stop = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  /* -------------------------------- sessions ------------------------------- */

  const newChat = useCallback(() => {
    controllerRef.current?.abort();
    setSessionId(null);
    setMessages([]);
    setError(null);
    setPendingPermission(null);
    streamIdRef.current = null;
  }, []);

  const selectSession = useCallback(async (id: string) => {
    controllerRef.current?.abort();
    setSessionId(id);
    setError(null);
    setPendingPermission(null);
    try {
      const detail = await api.fetchSession(id);
      if (!aliveRef.current) return;
      setMessages(
        (detail.messages ?? []).map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          model: message.model,
          createdAt: message.createdAt,
        })),
      );
    } catch (caught) {
      if (aliveRef.current) {
        setError(caught instanceof Error ? caught.message : 'Could not open that conversation.');
      }
    }
  }, []);

  const removeSession = useCallback(
    async (id: string) => {
      await api.deleteSession(id).catch(() => undefined);
      if (id === sessionId) newChat();
      await refreshSessions();
    },
    [newChat, refreshSessions, sessionId],
  );

  /* ------------------------------ permissions ------------------------------ */

  const resolvePermission = useCallback((allow: boolean) => {
    setPendingPermission((current) => {
      if (current) {
        void api.respondToPermission(
          current.requestId,
          allow ? 'allow' : 'deny',
          allow ? undefined : 'Denied by user',
        );
      }
      return null;
    });
  }, []);

  return {
    status,
    error,
    models,
    model,
    setModel: setModelState,
    sessions,
    sessionId,
    messages,
    pendingPermission,
    activity,
    permissionMode,
    setPermissionMode,
    send,
    stop,
    newChat,
    selectSession,
    removeSession,
    resolvePermission,
    clearError: () => setError(null),
  };
}
