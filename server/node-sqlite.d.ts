/**
 * Minimal ambient typings for Node's built-in `node:sqlite` module.
 *
 * `node:sqlite` ships with Node >= 22.5 but `@types/node@20` does not declare it yet,
 * so we describe just the surface `db.ts` uses. Delete this file once the project moves
 * to `@types/node@24` (or if you swap in `better-sqlite3`).
 */
declare module 'node:sqlite' {
  export class DatabaseSync {
    constructor(location: string, options?: { open?: boolean; readOnly?: boolean });
    exec(sql: string): void;
    prepare(sql: string): {
      run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
      get(...params: unknown[]): unknown;
      all(...params: unknown[]): unknown[];
    };
    close(): void;
  }

  export class StatementSync {
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  }
}
