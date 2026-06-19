# MamaSQL — Design Spec

**Date:** 2026-06-19
**Status:** Approved — Milestone 1 ready for implementation planning
**Repo:** https://github.com/fizzexual/MamaSQL

---

## 1. Vision

MamaSQL is a **high-end desktop database manager** — "the only SQL app you'll ever need."
A local-first power tool that connects to any database, lets you browse and manage
schemas, write and run SQL with a first-class editor, edit data inline, and ultimately
work with results in a spreadsheet-and-charts surface (inspired by Equals / Hex), all
in one polished native app.

This document captures the overall product decisions, the milestone roadmap, and the
**full design for Milestone 1** (the foundation). Each later milestone gets its own
spec → plan → build cycle.

---

## 2. Product decisions (locked)

| Decision | Choice | Notes |
|---|---|---|
| **Form factor** | Local-first **desktop app** | Connects directly to databases; not a hosted web app. |
| **Stack** | **Tauri + Rust** backend, **React + TypeScript** frontend | sqlx unifies the drivers; small/fast/secure binary. |
| **v1 engines** | **Postgres, SQLite, MySQL/MariaDB** | Similar driver models; proves the pluggable layer. |
| **"Easy install anything"** | (a) **Zero-config connect** — bundled drivers, no manual ODBC/DLL setup. (b) **One-click local engines** — app can download & manage local Postgres/MySQL instances. | (a) is in M1. (b) is Milestone 3. |
| **Design language** | Polished, inspired by the provided screenshot (Equals-style) | Spreadsheet UX itself is Milestone 4. |

### Explicitly deferred (post-M1, but part of the vision)
- Inline table editing + visual DDL → **Milestone 2**
- One-click local database engines → **Milestone 3**
- Spreadsheet + formula layer → **Milestone 4**
- Charts / visualizations → **Milestone 5**
- Scheduling, version history, plugin marketplace, more engines (SQL Server, Oracle,
  Snowflake, BigQuery), NoSQL → **Later**

---

## 3. Milestone roadmap

1. **M1 — A real multi-engine SQL client (foundation).** Connect, browse schema, edit
   SQL, run, view/sort/filter/export results, history. *This spec.*
2. **M2 — Inline table editing & visual schema management.** Edit cells, insert/delete
   rows safely; create/alter/drop tables, columns, indexes.
3. **M3 — One-click local engines.** Download & manage embedded Postgres/MySQL;
   lifecycle (create/start/stop/auto-connect).
4. **M4 — Spreadsheet + formula layer.** Results land in an editable spreadsheet with a
   formula engine, cell references, and formatting. (Needs its own sub-decomposition.)
5. **M5 — Charts & visualizations.** Build charts over result sets / spreadsheet ranges.
6. **Later.** Scheduling, version history, plugin marketplace, more engines, NoSQL.

Each milestone must ship as an independently usable product.

---

## 4. Milestone 1 — Scope

**In scope**
- Desktop app shell (Tauri) with a clean multi-pane layout.
- **Connection manager:** create / edit / test / delete connection profiles for
  Postgres, SQLite, MySQL/MariaDB. Credentials stored in the OS keychain.
- **Unified driver layer** with bundled, zero-config drivers (one `Driver` trait,
  three sqlx-backed implementations).
- **Schema / object browser:** lazy tree of databases → schemas → tables/views →
  columns; searchable.
- **SQL editor:** CodeMirror 6 with syntax highlighting + schema-aware autocomplete,
  multiple query tabs, run / cancel.
- **Results grid:** streamed, virtualized (Glide Data Grid); sort, filter, paginate,
  export CSV/JSON.
- **Query history:** persisted locally.

**Out of scope for M1:** everything in the deferred list (§2).

---

## 5. Architecture

Three layers separated by the Tauri IPC seam. The Rust core is the entire engine and
is UI-agnostic; the frontend holds **zero** database logic.

```
┌──────────────────────────────────────────────────────────────┐
│  FRONTEND — React + TypeScript  (system webview)               │
│  app shell · connection manager · schema tree · CodeMirror     │
│  SQL editor · results grid · query tabs · Zustand state        │
└───────────────────────────┬──────────────────────────────────┘
                            │   Tauri IPC
                            │   ↓ typed commands    ↑ streamed events
┌───────────────────────────┴──────────────────────────────────┐
│  RUST CORE  (src-tauri/)                                       │
│   commands   thin handlers — (de)serialize, route, no logic    │
│   connections  registry · sqlx pools · open/test/close         │
│   executor     run · stream rows · cancel · transactions       │
│   schema       introspection: databases → tables → columns     │
│   drivers      trait Driver →  Pg │ MySql │ Sqlite  (sqlx)      │
│   secrets      OS keychain via `keyring` crate                 │
│   store        app config + saved connections (a SQLite file)  │
└───────────────────────────┬──────────────────────────────────┘
                            │  sqlx async pools
              ┌─────────────┼─────────────┐
          Postgres      MySQL/MariaDB     SQLite
```

**Key abstraction — `Driver` trait.** Every future engine plugs in here. Methods:
`connect`, `test`, `execute`, `stream`, `introspect`, `cancel`. Three impls (Pg, MySql,
Sqlite) all built on **sqlx** (one async API for all three v1 engines).

---

## 6. Modules

### Rust core (`src-tauri/src/`)

| Module | Responsibility | Depends on |
|---|---|---|
| `drivers` | Engine-specific SQL/types behind one `Driver` trait | sqlx |
| `connections` | Connection profiles, sqlx pools, open/test/close lifecycle | drivers, secrets |
| `executor` | Run a query, stream rows in chunks, cancel, transactions | connections |
| `schema` | Introspect databases/schemas/tables/views/columns | connections |
| `secrets` | Read/write passwords in OS keychain | keyring |
| `store` | Persist settings + saved connections (no passwords), query history | sqlx/SQLite |
| `commands` | Tauri entry points; translate IPC ↔ core calls | all of the above |
| `error` | `AppError` enum + serialization to a typed TS union | — |

Each module is independently testable with no UI dependency.

### Frontend (`src/`)
- App shell / layout (resizable panes).
- Connection manager (list, form with validation, test button).
- Schema tree (lazy-loaded, searchable).
- Query tabs.
- CodeMirror 6 editor (schema-aware autocomplete completion source).
- Results grid (Glide Data Grid).
- Thin typed `ipc` wrapper around Tauri `invoke`/event listeners.
- Zustand store (connections, active query, schema cache).

### Proposed component libraries
- **Editor:** CodeMirror 6 (`@codemirror/lang-sql`, autocomplete API).
- **Results grid:** **Glide Data Grid** — canvas-based, handles millions of rows,
  native cell editing + spreadsheet feel. Chosen now so M2 (editing) and M4
  (spreadsheet) need no grid rewrite.
- **State:** Zustand.

---

## 7. Key data flows

### Run a query (streamed; UI never freezes)
1. User hits Run (`Ctrl+Enter`) → frontend calls `execute_query { connectionId, sql, queryId }`.
2. `commands` → `executor::run` → driver pulls rows from the sqlx pool **as a stream**.
3. Rows flow back in chunks via Tauri events (`query:rows:{queryId}`); the virtualized
   grid appends as they arrive — large results begin showing instantly.
4. Final event carries columns, row count, elapsed time — or a typed error.
5. **Cancel:** frontend sends a cancel signal; executor drops the stream and aborts.

### Schema browsing
Lazy — expanding a node introspects only that level; results cached in the store,
manually refreshable.

### Autocomplete
The editor's completion source reads the cached schema (tables/columns for the active
connection); refreshed on connect and on manual refresh.

---

## 8. Error handling — typed, surfaced, never silent

- Single `AppError` enum in Rust: `ConnectionFailed`, `AuthFailed`,
  `QueryError { message, position }`, `Timeout`, `Canceled`, `Internal` → serialized to
  a matching TypeScript union.
- DB errors preserve the engine's own message and (when provided) the **error position**,
  highlighted inline in the editor.
- **No `unwrap()` on command paths** — everything returns `Result`.
- Connection failures show in the manager with a retry; a result stream that errors
  mid-flight marks itself incomplete.

---

## 9. Security

- Passwords are stored **only** in the OS keychain (Windows Credential Manager on the
  target machine); the store DB holds connection metadata but **no secrets**.
- Connections use **TLS** whenever the server offers it (sqlx supported).

---

## 10. Testing strategy (TDD — tests lead)

- **Rust unit:** in-memory SQLite for fast tests.
- **Rust integration:** **testcontainers** spin up real Postgres + MySQL for
  driver/schema/executor tests. One **shared conformance suite** runs against all three
  drivers — the guarantee that the `Driver` trait genuinely unifies them.
- **Frontend:** Vitest + React Testing Library, mocking the `ipc` wrapper (form
  validation, grid rendering, editor wiring).
- **Smoke:** a Tauri-level test — connect to a seeded SQLite, run a query, assert rows.

---

## 11. Project structure

```
MamaSQL/
  src-tauri/
    src/
      drivers/      (mod.rs, postgres.rs, mysql.rs, sqlite.rs)
      connections/
      executor/
      schema/
      secrets/
      store/
      commands/
      error.rs
      lib.rs   main.rs
    Cargo.toml   tauri.conf.json
  src/
    components/   state/   ipc/   routes/
    App.tsx   main.tsx
  package.json   vite.config.ts   index.html
  docs/superpowers/specs/
```

---

## 12. Milestone 1 — Definition of Done

Launch the app → add a Postgres / MySQL / SQLite connection (credentials in keychain) →
browse its schema tree → write SQL with highlighting + autocomplete → run → results
stream into a sortable, filterable grid → export CSV/JSON → query history persists.
**All three engines green in the test suite.**

---

## 13. Risks / open questions

- **Glide Data Grid licensing/fit** — confirm it covers our editing + spreadsheet
  trajectory before committing irreversibly. (Fallback: TanStack Table + Virtual.)
- **sqlx dynamic queries** — sqlx's compile-time checking is for known queries; we run
  arbitrary user SQL, so we use its **runtime** query API and map rows dynamically by
  column type. Verify type coverage per engine.
- **testcontainers in CI** — requires Docker; ensure the CI runner provides it.
- **Large result memory** — streaming + virtualization must avoid materializing whole
  result sets in the frontend; cap retained rows with a "load more" affordance.
