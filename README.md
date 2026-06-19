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
