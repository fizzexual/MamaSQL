# MamaSQL M1 — Plan 3: Postgres + MySQL Drivers

> Extends Plan 1. Adds two engines behind the existing `Driver` trait. Verified
> against **local** Postgres + MariaDB instances (MariaDB is wire-compatible with
> the MySQL driver).

**Goal:** Implement `PgDriver` and `MySqlDriver` so MamaSQL connects to Postgres
and MySQL/MariaDB exactly like SQLite — connect/test, run queries with typed JSON
rows, and introspect schema — then wire them into the connection registry.

## Global constraints (additions)
- `sqlx` features grow to include `postgres`, `mysql`, and TLS. Keep `default-features = false`.
- No `unwrap()` on request paths (unchanged).
- Integration tests are **env-gated**: they run only when `MAMASQL_PG_URL` /
  `MAMASQL_MYSQL_URL` are set, so CI without a database stays green.

## Tasks

### Task 1: sqlx features + Postgres driver
**Files:** `src-tauri/Cargo.toml`, `src-tauri/src/drivers/postgres.rs`, `drivers/mod.rs`, `executor/mod.rs`
- Cargo: `sqlx` features → `["runtime-tokio", "tls-rustls", "sqlite", "postgres", "mysql", "chrono", "uuid"]` (adjust the rustls feature name if cargo rejects it).
- `PgDriver { pool: sqlx::PgPool }`:
  - `connect(cfg, password)` via `PgConnectOptions` (host, port default 5432, db, username, password) — avoids URL-encoding pitfalls.
  - `test`: open one connection, `SELECT 1`, close.
  - `Driver::execute`: SELECT-like → `fetch_all`, map columns (`name`, type via `Column::type_info().name()`), rows via `pg_row_to_values`; else `rows_affected`. Cap at `MAX_ROWS`.
  - `list_tables`: `information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema')`.
  - `list_columns`: `information_schema.columns` + primary-key flag from `information_schema.key_column_usage`/`table_constraints`.
- `executor::pg_row_to_values(&PgRow)`: map by type name — `INT2/INT4/INT8`→i64, `FLOAT4/FLOAT8`→f64, `BOOL`→bool, `NUMERIC`→string, `TIMESTAMP*/DATE/TIME`→string, `UUID`→string, `JSON/JSONB`→serde_json, else `TEXT`→string; NULL→null.

### Task 2: MySQL/MariaDB driver
**Files:** `src-tauri/src/drivers/mysql.rs`, `executor/mod.rs`
- `MySqlDriver { pool: sqlx::MySqlPool }` via `MySqlConnectOptions` (port default 3306).
- Introspection from `information_schema` with `table_schema = DATABASE()`.
- `mysql_row_to_values(&MySqlRow)`: `TINYINT/SMALLINT/INT/BIGINT`→i64, `FLOAT/DOUBLE`→f64, `DECIMAL`→string, `DATETIME/TIMESTAMP/DATE/TIME`→string, `JSON`→serde_json, else→string; NULL→null.

### Task 3: Wire into the registry + commands
**Files:** `connections/mod.rs`, `commands/mod.rs`
- Replace the `Engine::Postgres | Engine::MySql => Err(...)` arm in `ConnectionRegistry::open` with real driver construction.
- `commands::test_connection`: add Postgres/MySQL arms.

### Task 4: Env-gated integration tests
**Files:** `postgres.rs`, `mysql.rs` test modules
- `#[tokio::test]` guarded by `std::env::var("MAMASQL_PG_URL")` (skip/return early if unset). Connect, `CREATE TEMP TABLE`, insert, `SELECT` (assert typed rows), `list_tables`/`list_columns`. Same for MySQL with `MAMASQL_MYSQL_URL`.
- Run locally:
  - `MAMASQL_PG_URL=postgres://postgres:postgres@localhost:5432/postgres`
  - `MAMASQL_MYSQL_URL=mysql://root:root@localhost:3306/mysql` (MariaDB on 3306)

## Definition of Done
- `cargo test` green (SQLite always; PG/MySQL when the env URLs are set).
- From the app: add a Postgres connection and a MySQL/MariaDB connection, connect,
  browse schema, run a `SELECT`, see typed rows. Three engines, one `Driver` trait.
