/** Shared domain types for the Agent assistant (the Express backend in /server). */

export type AgentRole = 'user' | 'assistant';

export type ToolCallStatus = 'running' | 'completed' | 'error';

export interface AgentToolCall {
  id: string;
  name: string;
  input?: Record<string, unknown>;
  status: ToolCallStatus;
  result?: string;
  isError?: boolean;
}

export interface AgentMessage {
  id: string;
  role: AgentRole;
  content: string;
  model?: string | null;
  createdAt?: string;
  toolCalls?: AgentToolCall[];
  /** True while tokens are still arriving. */
  streaming?: boolean;
}

export interface AgentSession {
  id: string;
  title: string;
  model: string;
  sdk_session_id?: string | null;
  created_at: string;
  updated_at: string;
  messageCount?: number;
}

export interface AgentModel {
  modelId: string;
  name: string;
  description?: string;
}

export type PermissionMode = 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions';

export interface StreamInitEvent {
  type: 'init';
  sessionId: string;
  userMessageId: string;
  assistantMessageId: string;
  model: string;
}

export interface StreamTextEvent {
  type: 'text';
  content: string;
}

export interface StreamToolEvent {
  type: 'tool';
  id: string;
  name: string;
  input?: Record<string, unknown>;
  status: ToolCallStatus;
}

export interface StreamToolResultEvent {
  type: 'tool_result';
  toolId: string;
  content: string;
  isError: boolean;
}

export interface StreamPermissionEvent {
  type: 'permission_request';
  requestId: string;
  toolUseId?: string;
  toolName: string;
  input: Record<string, unknown>;
  sessionId: string;
  timestamp: number;
}

export interface StreamDoneEvent {
  type: 'done';
  duration?: number;
  cost?: number;
}

export interface StreamErrorEvent {
  type: 'error';
  message: string;
}

export type AgentStreamEvent =
  | StreamInitEvent
  | StreamTextEvent
  | StreamToolEvent
  | StreamToolResultEvent
  | StreamPermissionEvent
  | StreamDoneEvent
  | StreamErrorEvent;

/* --------------------------- verification domain --------------------------- */

export type VerifyStatus = 'pending' | 'hashing' | 'verified' | 'failed' | 'missing' | 'unlisted' | 'error' | 'cancelled';
