# MamaSQL

**The only SQL app you'll ever need.** A high-end, local-first desktop database manager —
connect to any database, browse and manage schemas, write and run SQL in a first-class
editor, edit data inline, and (soon) work with results in a spreadsheet-and-charts surface.

> Status: **Milestone 1 functionally complete** — a polished, multi-engine SQL client.
> **Three engines (SQLite · Postgres · MySQL/MariaDB)** behind one `Driver` trait, each
> verified against a live database. **27 tests** (16 Rust — including live Postgres 17 +
> MariaDB 12.3 integration — and 11 TypeScript); strict `tsc` + Vite bundle clean.
> Next: **M2** (inline table editing).

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
```

## Roadmap

| Milestone | What |
|---|---|
| **M1** | Multi-engine SQL client: connections, schema browser, SQL editor + autocomplete, streamed results grid, export, history. |
| **M2** | Inline table editing & visual schema management (DDL). |
| **M3** | One-click local engines (download & manage embedded Postgres/MySQL). |
| **M4** | Spreadsheet + formula layer. |
| **M5** | Charts & visualizations. |
| Later | Scheduling, version history, plugin marketplace, more engines (SQL Server, Oracle, Snowflake, BigQuery), NoSQL. |

## Design

See [`docs/superpowers/specs/`](docs/superpowers/specs/) for the full design spec.

## Engines (v1)

Postgres · MySQL / MariaDB · SQLite — all with bundled, zero-config drivers.

---

_Built with [Claude Code](https://claude.com/claude-code)._
