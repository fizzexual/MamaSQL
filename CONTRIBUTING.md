# Contributing to MamaSQL

Thanks for your interest in MamaSQL. This guide covers how to set up the project, run
it, test it, and send a change.

To report a security problem, do not open an issue. Follow [SECURITY.md](SECURITY.md).

## Prerequisites

- **Node.js 18 or newer.** CI uses Node 20.
- **Rust**, stable toolchain (`x86_64-pc-windows-msvc` on Windows).
- **MSVC C++ Build Tools** (Windows), needed by the Rust build.
- **WebView2** runtime. It ships with Windows 10 and 11.
- **Docker** with Compose, only if you work on the Docker setup.

## Setup

```bash
git clone https://github.com/<your-username>/MamaSQL.git
cd MamaSQL
npm install
```

## Run

```bash
npm run tauri dev     # desktop app (Vite + Rust)
npm run dev:all       # web build: Vite UI + Node bridge
npm start             # web build on port 5001 + Node bridge
```

On Windows you can also double-click `run.bat`. It installs dependencies on first run
and asks whether to start the desktop app or the web preview.

To build and run the Docker images from your checkout:

```bash
docker compose -f docker-compose.build.yml up -d --build
```

To create a large SQLite demo database ("Acme Commerce") for screenshots:

```bash
npm run seed:demo
```

## Test

```bash
cd src-tauri && cargo test
```

The PostgreSQL and MySQL integration tests are skipped unless `MAMASQL_PG_TEST` or
`MAMASQL_MYSQL_TEST` is set. Without them, the rest of the Rust suite still runs.

The TypeScript store tests use Vitest (`src/state/store.test.ts`).

## Type check and build

There is no linter or formatter set up. Type checking runs as part of the build:

```bash
npm run build                          # tsc (strict) + Vite production build
npm run tauri build -- --no-bundle     # standalone exe: src-tauri/target/release/mamasql.exe
```

Match the style of the code around your change.

## CI

There are no CI checks on pull requests. After a merge to `main`:

- **Release** (`.github/workflows/release.yml`) builds `MamaSQL.exe` with
  `npm run tauri build -- --no-bundle` and publishes a new release.
- **Publish Docker images** (`.github/workflows/docker-publish.yml`) builds the `web`
  and `bridge` images and pushes them to GHCR.

A broken build on `main` breaks the next release. Before you open a PR, make sure
`npm run build` and `cargo test` pass, and that `npm run tauri build -- --no-bundle`
works if you changed Rust code or packaging.

## Proposing a change

1. Fork the repo and create a branch from `main`.
2. Make your change. Keep the PR small and about one thing.
3. Add or update tests when you change behavior.
4. Run the checks above. They must pass.
5. Open a pull request against `main`. Say what you changed and why.

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE).
