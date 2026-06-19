# MamaSQL M1 — Frontend (React UI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax. UI work is verified with **live browser preview** (Vite + a mock `ipc`) plus Vitest component tests.

**Goal:** Build the MamaSQL desktop UI on top of the Plan 1 backend — connection manager, schema tree, SQL editor with autocomplete, results grid, run/cancel, CSV/JSON export, and query history — a usable app matching the reference screenshot.

**Architecture:** React + TypeScript (Vite) inside the Tauri webview. A typed `ipc` layer wraps Tauri `invoke`; when not running under Tauri (plain browser), it swaps to an in-memory **mock backend** so the UI is fully runnable/verifiable in a browser. A Zustand store holds connections, schema cache, query tabs, results, and history. Components are presentational and read/write the store.

**Tech Stack:** React 19, TypeScript 5, Vite 7, Zustand, CodeMirror 6 (`@codemirror/lang-sql`), a virtualized results grid (custom for M1; Glide Data Grid adopted at M2 when cell-editing lands — kept behind a stable `<ResultsGrid>` prop interface).

## Global Constraints

- All backend calls go through `src/ipc/` — components never call `invoke` directly.
- TS DTOs mirror the Rust types exactly (camelCase): `ConnectionConfig`, `QueryResult`, `Column`, `TableInfo`, `ColumnInfo`, `HistoryEntry`, `AppError { kind, message?, position? }`. Engine is `"postgres" | "mysql" | "sqlite"`.
- The app must run **both** in a browser (mock ipc) and under `npm run tauri dev` (real ipc). Detect via `'__TAURI_INTERNALS__' in window`.
- Light, polished aesthetic evoking the screenshot: browser-frame canvas, clean panels, monospace editor, dense results grid. CSS variables for theming (dark mode later).
- Errors surfaced as typed `AppError`, shown inline (editor) or as a toast — never swallowed.

## File Structure

```
src/
  ipc/
    types.ts        # TS mirrors of Rust DTOs
    backend.ts      # Backend interface + isTauri() + getBackend()
    tauri.ts        # real impl over @tauri-apps/api invoke
    mock.ts         # in-memory mock backend (sample data) for browser
  state/
    store.ts        # Zustand store
  components/
    AppShell.tsx        Header.tsx
    ConnectionSidebar.tsx  ConnectionForm.tsx
    SchemaTree.tsx
    SqlEditor.tsx
    ResultsGrid.tsx
    HistoryPanel.tsx
    StatusBar.tsx
  lib/
    csv.ts          # rows -> CSV/JSON export
  App.tsx  main.tsx  styles.css
```

---

## Task 1: IPC layer — types, backend interface, real + mock impls

**Files:** `src/ipc/types.ts`, `src/ipc/backend.ts`, `src/ipc/tauri.ts`, `src/ipc/mock.ts`
**Test:** `src/ipc/mock.test.ts` (Vitest)

**Interfaces — Produces:**
```ts
// types.ts
export type Engine = "postgres" | "mysql" | "sqlite";
export interface ConnectionConfig { id: string; name: string; engine: Engine;
  host?: string | null; port?: number | null; database: string; username?: string | null; }
export interface Column { name: string; dataType: string; }
export interface QueryResult { columns: Column[]; rows: unknown[][];
  rowsAffected: number; elapsedMs: number; truncated: boolean; }
export interface TableInfo { name: string; kind: string; schema: string | null; }
export interface ColumnInfo { name: string; dataType: string; nullable: boolean; isPrimaryKey: boolean; }
export interface HistoryEntry { id: number; connectionId: string; sql: string; ranAt: string; }
export interface AppError { kind: string; message?: string; position?: number | null; }

// backend.ts
export interface Backend {
  listConnections(): Promise<ConnectionConfig[]>;
  saveConnection(cfg: ConnectionConfig, password?: string | null): Promise<void>;
  deleteConnection(id: string): Promise<void>;
  testConnection(cfg: ConnectionConfig, password?: string | null): Promise<void>;
  openConnection(id: string): Promise<void>;
  closeConnection(id: string): Promise<void>;
  runQuery(connectionId: string, sql: string): Promise<QueryResult>;
  listTables(connectionId: string): Promise<TableInfo[]>;
  listColumns(connectionId: string, table: string): Promise<ColumnInfo[]>;
  recentHistory(limit: number): Promise<HistoryEntry[]>;
}
export function isTauri(): boolean;     // '__TAURI_INTERNALS__' in window
export function getBackend(): Backend;  // tauri impl if isTauri(), else mock
```

- [ ] **Step 1: Write the mock test** — `mock.test.ts`: save a sqlite connection, open it, `runQuery("SELECT ...")` returns the seeded columns/rows; `listTables` returns the sample tables.
- [ ] **Step 2: Implement `types.ts`, `backend.ts`** (signatures above).
- [ ] **Step 3: Implement `tauri.ts`** — each method calls `invoke('snake_case_name', { camelArgs })`. Arg keys: `cfg`, `password`, `id`, `connectionId`, `sql`, `table`, `limit`.
- [ ] **Step 4: Implement `mock.ts`** — in-memory `Map` of connections; a seeded sample dataset (`customers`, `orders`, `products`) with a tiny SQL-ish evaluator: support `SELECT * FROM <t>`, `SELECT count(*) FROM <t>`, and fallback returning the table; `listTables`/`listColumns` from the sample schema; history accumulates.
- [ ] **Step 5: Run** `npx vitest run src/ipc` → PASS.
- [ ] **Step 6: Commit** `feat(ui): ipc layer with real Tauri + browser mock backends`.

---

## Task 2: Zustand store

**Files:** `src/state/store.ts`  **Test:** `src/state/store.test.ts`

**Produces:** `useStore` with state `{ connections, activeConnectionId, schema: {tables, columnsByTable}, sql, result, error, running, history }` and actions `loadConnections`, `selectConnection(id)`, `openAndIntrospect(id)`, `setSql(s)`, `run()`, `cancel()`, `loadHistory()`. `run()` sets `running`, calls `backend.runQuery`, stores `result` or `error`, appends history.

- [ ] Step 1: Test — `run()` populates `result` from the mock and clears `error`; a failing query sets `error`.
- [ ] Step 2: Implement store using `getBackend()`.
- [ ] Step 3: `npx vitest run src/state` → PASS.
- [ ] Step 4: Commit `feat(ui): zustand store wiring ipc to UI state`.

---

## Task 3: App shell + styling skeleton

**Files:** `src/components/AppShell.tsx`, `Header.tsx`, `StatusBar.tsx`, `styles.css`, `App.tsx`

Three-region layout inside a browser-frame canvas (matching the screenshot): top **Header** (app menu, connection name, Run), left **sidebar** (connections + schema tree), center **editor over results** (vertical split), bottom **StatusBar** (row count, elapsed, truncated badge). Light theme via CSS variables.

- [ ] Step 1: Implement layout + CSS; render placeholders in each region.
- [ ] Step 2: **Verify in browser** — `preview_start` (vite), `preview_screenshot`; confirm the three-pane frame renders. Iterate CSS.
- [ ] Step 3: Commit `feat(ui): app shell, header, status bar, base theme`.

---

## Task 4: Connection sidebar + form

**Files:** `ConnectionSidebar.tsx`, `ConnectionForm.tsx`

List saved connections (from store); "+" opens a form (name, engine select, host/port/database/username/password; SQLite shows only a file path). Buttons: Test, Save, Connect, Delete. On Connect → `openAndIntrospect`.

- [ ] Step 1: Implement; wire to store/ipc.
- [ ] Step 2: Browser-verify — add a SQLite "demo" connection (mock), connect, see it active. `preview_click`/`preview_fill` + screenshot.
- [ ] Step 3: Commit `feat(ui): connection sidebar + form`.

---

## Task 5: Schema tree

**Files:** `SchemaTree.tsx` — lazy tree: tables/views → expand → columns (PK/null badges). Click a table inserts `SELECT * FROM <t> LIMIT 100` into the editor.

- [ ] Step 1: Implement (uses store schema cache).
- [ ] Step 2: Browser-verify — expand `customers`, see columns; click inserts SQL. Screenshot.
- [ ] Step 3: Commit `feat(ui): lazy schema tree`.

---

## Task 6: SQL editor (CodeMirror 6) + autocomplete

**Files:** `SqlEditor.tsx`. Deps: `codemirror @codemirror/lang-sql @codemirror/view @codemirror/state @codemirror/autocomplete`. `Ctrl+Enter` → `run()`. Schema-aware completion sourced from the store's cached tables/columns.

- [ ] Step 1: Install deps; implement editor bound to `store.sql`.
- [ ] Step 2: Add SQL highlighting + schema completion + run keybinding.
- [ ] Step 3: Browser-verify — type SQL, highlighting works, `Ctrl+Enter` runs. Screenshot.
- [ ] Step 4: Commit `feat(ui): CodeMirror SQL editor with schema autocomplete`.

---

## Task 7: Results grid + export + history

**Files:** `ResultsGrid.tsx`, `HistoryPanel.tsx`, `lib/csv.ts`

`<ResultsGrid result={QueryResult}>` — virtualized rows, sticky header, click-header sort, NULL styled, column-resize. Toolbar: Export CSV / JSON (`lib/csv.ts`). HistoryPanel lists `recentHistory`; click re-loads SQL.

- [ ] Step 1: Implement grid + csv export + history panel.
- [ ] Step 2: Browser-verify — run `SELECT * FROM customers`, rows render, sort works, export downloads. Screenshots.
- [ ] Step 3: Commit `feat(ui): results grid, CSV/JSON export, history panel`.

---

## Task 8: Real Tauri integration pass

- [ ] Step 1: `npm run tauri dev`; create a real SQLite connection to a temp file; create a table, insert, `SELECT`, browse schema, export, confirm history persists.
- [ ] Step 2: Fix any real-vs-mock gaps (arg names, serialization).
- [ ] Step 3: Commit `feat(ui): verified end-to-end against the Rust backend`.

---

## Verification strategy

- **Component/logic:** Vitest + Testing Library, mock `getBackend()`.
- **Visual/interaction:** `preview_*` tools against the Vite dev server (mock ipc) — screenshots + simulated clicks/typing at each UI task.
- **End-to-end:** `npm run tauri dev` for the real backend (Task 8).

## Definition of Done

Launch → add/connect a SQLite connection → browse schema → write SQL with highlighting + autocomplete → `Ctrl+Enter` → results render in the grid → sort + export CSV/JSON → history persists. Works in-browser (mock) and under Tauri (real). Vitest green.
