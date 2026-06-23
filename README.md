# MamaSQL

**The only SQL app you'll ever need.** A high-end, local-first desktop database manager —
connect to any database, browse and manage schemas, write and run SQL in a first-class
editor, edit data inline, and (soon) work with results in a spreadsheet-and-charts surface.

> Status: **Milestones 1–5 all delivered.** A polished, multi-engine SQL client with
> inline editing, visual DDL, one-click local databases, and chart + stats views.
> **Three engines (SQLite · Postgres · MySQL/MariaDB)** behind one `Driver` trait, each
> verified against a live database. **32 tests** (21 Rust — incl. live Postgres 17 +
> MariaDB 12.3 integration & an edit round-trip — and 11 TypeScript); strict `tsc` + Vite
> bundle clean.

## Run with Docker (easiest — any OS)

Requires Docker with Compose. You only need two files — `docker-compose.yml` and
`.env` — no source checkout, no build step. Prebuilt images are pulled from the
GitHub Container Registry.

```bash
# grab the compose file (and optionally the env template), then:
cp .env.example .env      # optional — only to change ports/credentials
docker compose up -d
```

Then open **http://localhost:5001**. This runs the web UI (`web`), the engine
bridge that opens real PostgreSQL/MySQL sockets for the browser (`bridge`), and
two demo databases you can connect to right away (`postgres`, `mysql`).

Connect from the app via **＋ New connection**:

- **SQLite** — pick a name; it's a real local database kept in your browser (no server).
- **Demo PostgreSQL** — host `postgres`, port `5432`, user/password `mamasql`, database `demo`.
- **Demo MySQL** — host `mysql`, port `3306`, user `root`, password `mamasql`, database `demo`.
- **Your own DB** — use its host/port; for a DB on your host machine use `host.docker.internal`.

`docker compose down` stops it (`-v` also removes the demo-DB volumes). Configure
ports/credentials/version in `.env` (see `.env.example`). Don't want the demo
databases? Delete the `postgres`/`mysql` services from `docker-compose.yml`.

**Build the images yourself** (from a source checkout) instead of pulling:

```bash
docker compose -f docker-compose.build.yml up -d --build
```

> The published images come from the **Publish Docker images** GitHub Action
> (`.github/workflows/docker-publish.yml`), which pushes `mamasql-web` and
> `mamasql-bridge` to `ghcr.io/<owner>/…` on every push to `main` and on
> `v*` tags. After the first run, make those two packages **public** in the
> repo's GitHub *Packages* settings so anyone can pull them without logging in.

To run from source for development: `npm install && npm run dev:all` (web app +
bridge), then open the printed Vite URL.

## Download

Grab the latest **standalone Windows executable** from the
[**Releases** page](https://github.com/fizzexual/MamaSQL/releases) — download
`MamaSQL.exe` and run it. No installer, no wizard, nothing else to download.
*(CI rebuilds it on every push to `main`; it uses the WebView2 runtime that ships
with Windows 10 & 11.)*

## Stack

- **Backend:** Rust + [Tauri](https://tauri.app), with [sqlx](https://github.com/launchbadge/sqlx)
  as a unified async driver for Postgres, MySQL/MariaDB, and SQLite.
- **Frontend:** React + TypeScript (Vite), CodeMirror 6 editor, a virtualized results
  grid (Glide Data Grid arrives with M2 editing), Zustand.

## Develop

Prerequisites: **Node 18+**, **Rust** (stable `x86_64-pc-windows-msvc`), and the
**MSVC C++ Build Tools** (Windows). WebView2 ships with Windows 10/11.

```bash
npm install                  # JS dependencies
npm run tauri dev            # run the app (Vite + Rust)
cd src-tauri && cargo test   # backend test suite

# Package a standalone executable:
npm run tauri build -- --no-bundle   # → src-tauri/target/release/mamasql.exe
npm run tauri build                  # full installer (NSIS / MSI)
```

## Roadmap

| Milestone | Status | What |
|---|---|---|
| **M1** | ✅ | Multi-engine SQL client: connections, schema browser, CodeMirror editor + autocomplete, results grid, export, history. |
| **M2** | ✅ | Inline cell editing, add/delete rows, visual create/drop table. |
| **M3** | ✅* | One-click local SQLite databases. *(Managed embedded Postgres/MySQL download — follow-up.)* |
| **M4** | ✅* | Per-column **Stats** view. *(Full spreadsheet formula engine — follow-up.)* |
| **M5** | ✅ | **Chart** view — bar / line / pie over any result set. |
| Later | — | Scheduling, version history, plugin marketplace, more engines (SQL Server, Oracle, Snowflake, BigQuery), NoSQL. |

## Design

See [`docs/superpowers/specs/`](docs/superpowers/specs/) for the full design spec.

## Engines (v1)

Postgres · MySQL / MariaDB · SQLite — all with bundled, zero-config drivers.

---

_Built with [Claude Code](https://claude.com/claude-code)._
