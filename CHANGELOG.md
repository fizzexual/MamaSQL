# Changelog

All notable changes to MamaSQL are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

CI builds a new `v0.1.N` release on every push to `main` (N is the CI run number), so
there are many small releases. Docs-only commits marked `[skip ci]`, such as updates to
this file, do not create a release. This file groups releases by date. Dates are
YYYY-MM-DD (UTC). The per-release notes and the `MamaSQL.exe` downloads are on the
[GitHub Releases page](https://github.com/fizzexual/MamaSQL/releases).

## [0.1.98 - 0.1.100] - 2026-10-06

### Added
- CHANGELOG and CONTRIBUTING guides (0.1.98).
- `npm test` runs the frontend tests (Vitest) (0.1.100).

### Fixed
- The store tests pass again: they now build their own in-memory SQLite connections instead
  of relying on the demo connections removed earlier, and check the per-editor results and
  the "Open a connection first." message (0.1.100). No app behaviour changed.

### Security
- Updated dependencies to close Dependabot alerts: mysql2 3.24.5, vitest 4.1.11, postcss,
  shell-quote, browserslist (0.1.99). Build and the Rust tests pass unchanged.

## [0.1.97] - 2026-10-05

### Changed
- README: added an About section. No app changes.

## [0.1.95 - 0.1.96] - 2026-07-21

### Fixed
- The Node bridge explains connection failures instead of showing a bare
  `connect ETIMEDOUT`.

### Security
- Docker: the demo databases are no longer published on every network interface.
  They are bound to localhost by default (`DB_BIND_ADDR`).

## [0.1.93 - 0.1.94] - 2026-06-26

### Added
- Security policy (`SECURITY.md`).

### Security
- Forced `esbuild` 0.28.1 or newer to patch a dev-server path traversal
  (GHSA-g7r4-m6w7-qqqr).

## [0.1.86 - 0.1.92] - 2026-06-25

### Added
- Smooth, eased mouse-wheel scrolling in the app's scroll areas.
- MIT license.

### Changed
- Theme and logo now match the landing page (favicon and titlebar wordmark).
- Size-optimized release build profile and a single NSIS installer.
- README rewritten with a technical architecture overview.

## [0.1.41 - 0.1.85] - 2026-06-24

### Added
- Bridge: reach a database on the host from Docker (`localhost` is remapped to the host).
- Multiple SQL editor tabs, and multiple table tabs (Ctrl/Cmd-click a table).
- Labeled Execute button in the editor run bar.
- ER schema diagram and DDL view, with scroll to zoom.
- Data grid: pagination, foreign-key click-through, a filter that searches the whole
  table, and click a cell then Ctrl/Cmd+C to copy it.
- Safety: read-only mode, confirmation for destructive actions, encrypted credentials.
- Connection environment colour-coding and a production write guard.
- Transaction mode: manual commit, commit/rollback, and an uncommitted badge.
- Export/copy menu, SQL formatter, JSON cell viewer, and `:params` in queries.
- Import a CSV into a new or existing table.
- Schema diff between two connections.
- Bulk table actions and multi-select in the schema tree.
- Editor keys: duplicate/move line, wrap, indent, tab switch.
- History: search, re-run, and star to favorite.
- Prompt to skip foreign-key checks before deletions, including bulk Drop/Clear.
- SQLite databases are stored in a server folder, shared across browsers, tabs and ports.
- `npm start` runs the web app (port 5001) and the bridge together.
- Logs table and upgraded schema diagram.

### Changed
- Re-skin to a dark, violet-accent look, with Framer Motion animations on overlays,
  modals and views.
- Real field-type picker in the column editor.
- Faster table switches.

### Fixed
- Replaced the broken per-column filter row with a global filter toolbar.
- Row inspector ("Edit row in panel") now opens.
- Editor no longer doubles auto-closed brackets.
- One bad request can no longer crash the engine bridge.
- Bridge drops views as views (drop-all left views behind).
- Bridge reopens dropped database connections after an idle timeout.
- Transient bridge outages are retried instead of showing HTTP 500.
- Grid rows no longer shift on hover, and no black flash when switching tables.
- JSON cells show their data instead of `[object Object]`; binary cells are decoded.
- Dead or stub buttons wired up; Esc closes the import modal.
- Sidebar: no text selection on tree labels; re-clicking the selected table does not
  reload it.
- Row editor Styles tab works.

## [0.1.24 - 0.1.40] - 2026-06-23

### Added
- Command palette.
- Right-click menus and add buttons on schema-tree folders.
- Result chart and live result filter.
- Real local SQLite engine in the browser and persistent connections (demo data removed).
- Engine bridge: real PostgreSQL and MySQL from the browser build.
- Toasts, session restore, and a resizable sidebar.
- Loading skeleton that matches the table layout, and an empty-table state.
- One-command Docker Compose setup, with prebuilt images on GHCR and a CI workflow to
  publish them.
- Warning when a remote host is `localhost` inside Docker.

### Changed
- Several UI redesigns, ending with a dark DbVisualizer-style theme and a nested tree
  sidebar.

### Fixed
- Bridge supports multi-statement queries (simple query protocol when there are no
  params).
- Loading skeleton no longer flashes or covers the data.

## [0.1.17 - 0.1.23] - 2026-06-22

### Added
- Dashboard home screen focused on SQL.
- Connections and Logs pages, and a custom connection modal.

### Fixed
- Bugs on the Connections and Logs pages.

## [0.1.9 - 0.1.16] - 2026-06-20

### Added
- List and create databases on a server, and an Add Server button.
- `run.bat` launcher for Windows.
- Column sort, status bar, and cell tooltips.

### Changed
- UI rebuilt on the Mantine framework, with a dark data view.
- Safer add-source flow.

### Fixed
- Switching data sources clears the previous source's tables and data.

## [0.1.3 - 0.1.8] - 2026-06-19

First versioned releases. An earlier rolling release tagged `latest` was also published
on this date.

### Added
- One `Driver` interface with three engines: SQLite, PostgreSQL, and MySQL/MariaDB.
- Passwords stored in the OS keychain.
- CodeMirror 6 SQL editor with schema-aware autocomplete.
- Schema tree, results grid, export, and query history.
- Inline cell editing, add and delete rows (primary-key safe).
- Visual create/drop table designer.
- One-click local SQLite databases.
- Stats (per-column) and Chart (bar, line, pie) result views.
- Finder that scans `localhost` for running database ports.
- Form-based row editor in a right-side inspector panel.
- Skeleton loaders.
- CI builds a standalone `MamaSQL.exe` and publishes it to GitHub Releases.

### Fixed
- Skeleton loader stuck on real databases.
