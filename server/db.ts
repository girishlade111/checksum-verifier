/**
 * SQLite persistence for chat sessions and messages.
 *
 * Uses Node's built-in `node:sqlite` (Node >= 22.5) so the project has **zero native
 * dependencies** — no `node-gyp`, no prebuilt binaries, works on Windows/macOS/Linux.
 *
 * If you are on an older Node, either upgrade, or swap this file for the
 * `better-sqlite3` version shipped with the codebuddy-chat-web template: the exported
 * API is identical.
 */

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '..', 'data', 'chat.db');

const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new DatabaseSync(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id              TEXT PRIMARY KEY,
    title           TEXT NOT NULL,
    model           TEXT NOT NULL,
    sdk_session_id  TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id          TEXT PRIMARY KEY,
    session_id  TEXT NOT NULL,
    role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content     TEXT NOT NULL,
    model       TEXT,
    created_at  TEXT NOT NULL,
    tool_calls  TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
`);

/* ---------------------------------- types ---------------------------------- */

export interface DbSession {
  id: string;
  title: string;
  model: string;
  sdk_session_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  model: string | null;
  created_at: string;
  tool_calls: string | null;
}

/* -------------------------------- sessions -------------------------------- */

export function getAllSessions(): DbSession[] {
  return db.prepare('SELECT * FROM sessions ORDER BY updated_at DESC').all() as DbSession[];
}

export function getSession(id: string): DbSession | undefined {
  return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as DbSession | undefined;
}

export function createSession(session: DbSession): DbSession {
  db.prepare(
    `INSERT INTO sessions (id, title, model, sdk_session_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    session.id,
    session.title,
    session.model,
    session.sdk_session_id,
    session.created_at,
    session.updated_at,
  );
  return session;
}

export function updateSession(
  id: string,
  updates: Partial<Pick<DbSession, 'title' | 'model' | 'sdk_session_id'>>,
): boolean {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.title !== undefined) {
    fields.push('title = ?');
    values.push(updates.title);
  }
  if (updates.model !== undefined) {
    fields.push('model = ?');
    values.push(updates.model);
  }
  if (updates.sdk_session_id !== undefined) {
    fields.push('sdk_session_id = ?');
    values.push(updates.sdk_session_id);
  }

  if (fields.length === 0) return false;

  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);

  const result = db.prepare(`UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return result.changes > 0;
}

export function deleteSession(id: string): boolean {
  // Messages cascade, but do it explicitly so the behaviour matches the template
  // even if the schema was created by an older version.
  db.prepare('DELETE FROM messages WHERE session_id = ?').run(id);
  const result = db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  return result.changes > 0;
}

/* -------------------------------- messages -------------------------------- */

export function getMessagesBySession(sessionId: string): DbMessage[] {
  return db
    .prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC')
    .all(sessionId) as DbMessage[];
}

export function createMessage(message: DbMessage): DbMessage {
  db.prepare(
    `INSERT INTO messages (id, session_id, role, content, model, created_at, tool_calls)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    message.id,
    message.session_id,
    message.role,
    message.content,
    message.model,
    message.created_at,
    message.tool_calls,
  );

  db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(
    new Date().toISOString(),
    message.session_id,
  );

  return message;
}

export function updateMessage(
  id: string,
  updates: Partial<Pick<DbMessage, 'content' | 'tool_calls'>>,
): boolean {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.content !== undefined) {
    fields.push('content = ?');
    values.push(updates.content);
  }
  if (updates.tool_calls !== undefined) {
    fields.push('tool_calls = ?');
    values.push(updates.tool_calls);
  }

  if (fields.length === 0) return false;

  values.push(id);

  const result = db.prepare(`UPDATE messages SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return result.changes > 0;
}

export function deleteMessage(id: string): boolean {
  const result = db.prepare('DELETE FROM messages WHERE id = ?').run(id);
  return result.changes > 0;
}

export function clearAllData(): void {
  db.exec('DELETE FROM messages');
  db.exec('DELETE FROM sessions');
}

export default db;
