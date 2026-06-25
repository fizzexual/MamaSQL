# MamaSQL

*The only SQL app you'll ever need.*

[![Release build](https://github.com/fizzexual/MamaSQL/actions/workflows/release.yml/badge.svg)](https://github.com/fizzexual/MamaSQL/actions/workflows/release.yml)
[![Docker images](https://github.com/fizzexual/MamaSQL/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/fizzexual/MamaSQL/actions/workflows/docker-publish.yml)
[![Latest release](https://img.shields.io/github/v/release/fizzexual/MamaSQL?sort=semver&color=8b5cf6)](https://github.com/fizzexual/MamaSQL/releases/latest)

**A local-first, multi-engine SQL workbench** — one client for **PostgreSQL**, **MySQL/MariaDB**, and **SQLite** that runs as a single native desktop executable *or* entirely in the browser. Browse schemas, write SQL in a schema-aware CodeMirror editor, edit rows and tables inline, and pivot any result set into per-column statistics or a chart.

One driver abstraction, three engines, two runtimes, zero telemetry — credentials live in the OS keychain and your queries never leave your machine.

---

## Features

- **Three engines behind one interface.** PostgreSQL, MySQL/MariaDB, and SQLite implement a single async `Driver` trait, each verified against a live database. Native SQL types are normalized into a typed, JSON-serializable value model — integers, floats, `BigDecimal`, `chrono` date/time, UUID, JSON/JSONB, hex-encoded blobs.
- **Two runtimes, one codebase.** The desktop build (Tauri + Rust) talks to databases directly over async `sqlx`. The browser build runs SQLite in WebAssembly and reaches Postgres/MySQL through a thin Node TCP bridge. The React UI targets a single `Backend` interface and is agnostic to which one serves it.
- **A real editor.** CodeMirror 6 with schema-aware autocompletion (tables and columns pulled live from introspection), bracket matching, search, and `Ctrl`/`Cmd`+`Enter` to execute.
- **Inline data & schema editing.** Double-click to edit cells; insert and delete rows; visually create, drop, and alter tables — add/drop/rename columns, rename tables. Every mutation is assembled through engine-aware `quote_ident` / `literal` builders, never string concatenation.
- **Analyze in place.** Per-column **Stats** (count, nulls, distinct, min/max/sum/avg) and a dependency-free **Chart** view — bar, line, and pie rendered as hand-built SVG — over any result set.
- **One-click local databases.** Create a real SQLite database straight from the UI, and scan `localhost` for running Postgres/MySQL instances to connect to.
- **Ships as a single file.** A size-optimized Windows executable (`opt-level="z"` + LTO + symbol strip) on the WebView2 runtime — no installer, no bundled Chromium. Or `docker compose up` for the browser build with demo databases included.

---

## Architecture

The React frontend speaks to a single `Backend` interface; three implementations satisfy it depending on where the app is running.

```
  React + TypeScript UI                       schema-aware CodeMirror 6 · Zustand
  (editor · results · stats · charts)         results grid · inline edit · visual DDL
            │
            ▼
  Backend interface  (src/ipc/backend.ts)
            │
            ├──►  Desktop · Tauri 2 ───► invoke() IPC ───► Rust core
            │                                              sqlx (Tokio) · keyring
            │                                                   │
            │                                                   ▼
            │                                       PostgreSQL · MySQL · SQLite
            │
            └──►  Browser · web ──┬──► sql.js (WASM) ──────────► SQLite in IndexedDB
                                  │
                                  └──► HTTP ─► Node bridge ────► pg / mysql2 ─► PostgreSQL · MySQL
                                              (server/bridge.mjs)   real TCP sockets
```

### Engine layer (Rust)

- **`Driver` trait** (`src-tauri/src/drivers/`) — `execute`, `list_tables`, `list_columns` — implemented for SQLite, Postgres, and MySQL on top of **`sqlx` 0.8** (async, Tokio). Per-engine pools (SQLite capped at one connection to preserve session semantics; Postgres/MySQL pooled) are cached in a `ConnectionRegistry` keyed by connection id.
- **Type mapping** (`src-tauri/src/executor/`) — driver-specific row converters map native column types into a normalized `serde_json::Value` for IPC. `SELECT`s are capped at 50,000 rows with a `truncated` flag to bound memory.
- **Command surface** — 24 `#[tauri::command]` endpoints cover the connection lifecycle, query execution + history, schema introspection, inline DML (`update_cell` / `insert_row` / `delete_row`), and visual DDL.

### Two runtimes

- **Desktop (Tauri 2).** React renders in a WebView2 surface and `invoke()`s Rust commands over IPC; Rust opens real database sockets via `sqlx`. Passwords are stored in the Windows Credential Manager through `keyring` — never written to disk or config.
- **Browser (web build).** SQLite runs client-side as WebAssembly (`sql.js`) persisted to IndexedDB; Postgres/MySQL queries `POST` to a Node bridge (`server/bridge.mjs`) that owns the real `pg` / `mysql2` connections, since browsers cannot open raw TCP. Secrets are encrypted in IndexedDB with AES-GCM via SubtleCrypto, and the bridge is Docker-aware (remaps `localhost` → `host.docker.internal`).

### Safety

- All inline edits and DDL pass through engine-aware identifier quoting and literal escaping (`src-tauri/src/editing/` — backtick vs. double-quote per dialect, `''` / `""` escapes); `PRAGMA` and `CREATE DATABASE` identifiers are additionally sanitized.
- Errors are a typed Rust enum serialized to a stable `{ kind, message, position }` shape the UI switches on — `connectionFailed`, `authFailed`, `queryError`, `timeout`, `bridgeDown`, `notSupported`, ….

---

## Engines

| Engine | Driver | Verified against |
|---|---|---|
| **PostgreSQL** | `sqlx::postgres` | Postgres 17 — live integration round-trip |
| **MySQL / MariaDB** | `sqlx::mysql` | MariaDB 12.3 — live integration round-trip |
| **SQLite** | `sqlx::sqlite` (desktop) · `sql.js` WASM (browser) | unit + insert/introspect tests |

All drivers are bundled and zero-config.

---

## Run with Docker (easiest — any OS)

Requires Docker with Compose. You need only two files — `docker-compose.yml` and `.env` — no source checkout, no build step. Prebuilt images are pulled from the GitHub Container Registry.

```bash
cp .env.example .env      # optional — only to change ports/credentials
docker compose up -d
```

Then open **http://localhost:5001**. This runs the web UI (`web`), the engine bridge that opens real PostgreSQL/MySQL sockets for the browser (`bridge`), and two demo databases you can connect to immediately (`postgres`, `mysql`).

Connect from the app via **＋ New connection**:

- **SQLite** — pick a name; it's a real local database kept in your browser (no server).
- **Demo PostgreSQL** — host `postgres`, port `5432`, user/password `mamasql`, database `demo`.
- **Demo MySQL** — host `mysql`, port `3306`, user `root`, password `mamasql`, database `demo`.
- **Your own DB** — use its host/port; for a database on your host machine use `host.docker.internal`.

`docker compose down` stops it (`-v` also removes the demo-DB volumes). Configure ports/credentials/version in `.env`. Don't want the demo databases? Delete the `postgres`/`mysql` services from `docker-compose.yml`.

**Build the images yourself** from a source checkout instead of pulling:

```bash
docker compose -f docker-compose.build.yml up -d --build
```

> Published images come from the **Publish Docker images** workflow (`.github/workflows/docker-publish.yml`), which builds multi-arch (`linux/amd64,linux/arm64`) `mamasql-web` and `mamasql-bridge` images and pushes them to `ghcr.io/<owner>/…` on every push to `main` and on `v*` tags. After the first run, mark those two packages **public** in the repo's GitHub *Packages* settings so anyone can pull them without authenticating.

---

## Download (Windows)

Grab the latest **standalone executable** from the [**Releases** page](https://github.com/fizzexual/MamaSQL/releases) — download `MamaSQL.exe` and run it. No installer, no wizard, nothing else to fetch. CI rebuilds it on every push to `main`, and it runs on the WebView2 runtime that ships with Windows 10 & 11.

---

## Develop

Prerequisites: **Node 18+**, **Rust** (stable `x86_64-pc-windows-msvc`), and the **MSVC C++ Build Tools** (Windows). WebView2 ships with Windows 10/11.

```bash
npm install                  # JS dependencies
npm run tauri dev            # run the desktop app (Vite + Rust)

npm run dev:all              # run the web build instead: Vite UI + Node bridge
cd src-tauri && cargo test   # Rust test suite

# Package a standalone executable:
npm run tauri build -- --no-bundle   # → src-tauri/target/release/mamasql.exe
npm run tauri build                  # full installer (NSIS / MSI)
```

---

## Testing

**29 tests** across the stack.

- **23 Rust** (`cargo test`) — unit coverage of the SQL identifier/literal builders, per-engine type mapping, error serialization, the connection registry, and the local app store, plus full **create → insert → select → edit → introspect** round-trips against **live Postgres 17 and MariaDB 12.3** (gated behind `MAMASQL_PG_TEST` / `MAMASQL_MYSQL_TEST`).
- **6 TypeScript** (Vitest) — Zustand store behavior: connection load + introspection, the query success/failure paths, and source switching.

Strict `tsc` and a clean Vite production bundle are part of the build.

---

## Roadmap

| Milestone | Status | Scope |
|---|---|---|
| **M1** | ✅ | Multi-engine SQL client: connections, schema browser, CodeMirror editor + autocomplete, results grid, export, history. |
| **M2** | ✅ | Inline cell editing, add/delete rows, visual create/drop/alter table. |
| **M3** | ✅\* | One-click local SQLite databases. *(Managed embedded Postgres/MySQL download — follow-up.)* |
| **M4** | ✅\* | Per-column **Stats** view. *(Full spreadsheet formula engine — follow-up.)* |
| **M5** | ✅ | **Chart** view — bar / line / pie over any result set. |
| Later | — | Scheduling, version history, plugin marketplace, more engines (SQL Server, Oracle, Snowflake, BigQuery), NoSQL. |

---

## Stack

- **Core** — Rust 2021 · [Tauri 2](https://tauri.app) · [`sqlx` 0.8](https://github.com/launchbadge/sqlx) (Tokio) · `keyring` 3
- **Frontend** — React 19 · TypeScript 5.8 · Vite 7 · CodeMirror 6 · Zustand 5 · Mantine 8 · Framer Motion 12
- **Web bridge** — Node · [`pg`](https://github.com/brianc/node-postgres) 8 · [`mysql2`](https://github.com/sidorares/node-mysql2) 3 · [`sql.js`](https://github.com/sql-js/sql.js) 1.14 (SQLite compiled to WebAssembly)
- **Packaging** — Tauri/WebView2 single executable · multi-arch Docker images (nginx + Node) on GHCR

---

## Design

See [`docs/superpowers/specs/`](docs/superpowers/specs/) for the full design specification.

---

_Built with [Claude Code](https://claude.com/claude-code)._
