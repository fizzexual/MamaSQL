# MamaSQL M1 — Backend Core (SQLite Vertical Slice) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete Rust backend engine for MamaSQL working end-to-end against SQLite — connection profiles, query execution, schema introspection, local persistence, secret storage, and Tauri command wiring — all unit-tested.

**Architecture:** A UI-agnostic Rust core inside a Tauri 2 app. A `Driver` trait abstracts engines; this plan implements the SQLite driver (Postgres/MySQL come in Plan 3 against the same trait). A connection registry holds live `sqlx` pools in Tauri-managed state. Tauri commands form a thin layer over the core. The frontend (Plan 2) consumes these commands.

**Tech Stack:** Rust (edition 2021), Tauri 2, sqlx 0.8 (runtime-tokio, tls-rustls, sqlite/postgres/mysql, json, chrono), tokio, serde/serde_json, thiserror, keyring 3, async-trait, uuid. Frontend scaffold only: React 18 + TypeScript 5 + Vite.

## Global Constraints

- Rust edition **2021**; target Tauri **2.x** APIs (`tauri::command`, `Emitter`, `Manager`, `State`).
- sqlx version **0.8.x**, async with **tokio** runtime, TLS via **rustls** (no native OpenSSL).
- **No `unwrap()` / `expect()` / `panic!` on any command or request-handling path.** Every fallible function returns `Result<_, AppError>`.
- All public core types derive `serde::Serialize` + `serde::Deserialize` and use `#[serde(rename_all = "camelCase")]` so the TypeScript side sees camelCase.
- Passwords are **never** stored in the `store` SQLite DB or in `ConnectionConfig` — only in the OS keychain via `secrets`, keyed by connection id.
- Engine identifiers serialize as lowercase strings: `"postgres"`, `"mysql"`, `"sqlite"`.
- Buffered query results are capped at **MAX_ROWS = 50_000** retained rows for v1 (memory guard from the spec's risk list); the result reports `truncated: bool`.
- Commit after every task with a `feat:` / `chore:` / `test:` prefixed message.

---

## File Structure

```
src-tauri/
  Cargo.toml                  # deps
  tauri.conf.json             # tauri config
  src/
    main.rs                   # bin entry → calls lib run()
    lib.rs                    # builds Tauri app, registers state + commands
    error.rs                  # AppError
    types.rs                  # shared DTOs (Engine, ConnectionConfig, QueryResult, ...)
    drivers/
      mod.rs                  # Driver trait + Engine dispatch
      sqlite.rs               # SqliteDriver
    connections/mod.rs        # ConnectionRegistry (live pools in state)
    executor/mod.rs           # run query → QueryResult (row_to_json)
    schema/mod.rs             # introspection helpers (delegate to driver)
    store/mod.rs              # app SQLite: saved connections + query history
    secrets/mod.rs            # keyring wrapper
    commands/mod.rs           # #[tauri::command] handlers
src/                          # React app (scaffold only this plan)
  main.tsx  App.tsx
package.json  vite.config.ts  index.html  tsconfig.json
```

---

## Task 0: Project scaffold (Tauri 2 + React + TS) builds and runs

**Files:**
- Create: whole Tauri scaffold (`npm create tauri-app`), then trim to the structure above.
- Modify: `src-tauri/Cargo.toml` (add deps), `src-tauri/src/lib.rs`, `src-tauri/src/main.rs`.

**Interfaces:**
- Produces: a runnable Tauri app exposing one smoke command `ping() -> String` returning `"pong"`.

- [ ] **Step 1: Scaffold** — from `D:\New folder\MamaSQL`:

```bash
npm create tauri-app@latest . -- --template react-ts --manager npm --yes
```

If the directory-not-empty prompt blocks non-interactively, scaffold into a temp dir and copy `src/`, `src-tauri/`, `package.json`, `vite.config.ts`, `index.html`, `tsconfig*.json` over (do not overwrite `README.md`, `.gitignore`, `docs/`).

- [ ] **Step 2: Add backend dependencies** — set `src-tauri/Cargo.toml` `[dependencies]`:

```toml
tauri = { version = "2", features = [] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
sqlx = { version = "0.8", default-features = false, features = ["runtime-tokio", "tls-rustls", "sqlite", "postgres", "mysql", "json", "chrono"] }
thiserror = "2"
async-trait = "0.1"
keyring = "3"
uuid = { version = "1", features = ["v4"] }
chrono = { version = "0.4", features = ["serde"] }

[dev-dependencies]
tokio = { version = "1", features = ["full", "test-util"] }
```

- [ ] **Step 3: Replace `src-tauri/src/lib.rs`** with a minimal app + smoke command:

```rust
#[tauri::command]
fn ping() -> String {
    "pong".to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![ping])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

(`expect` here is the single allowed top-level startup exception — it is not a request path.)

- [ ] **Step 4: Verify it builds**

Run: `cd src-tauri && cargo build`
Expected: compiles successfully (first build downloads crates; allow time).

- [ ] **Step 5: Verify frontend deps install and typecheck**

Run: `npm install && npm run build`
Expected: Vite build succeeds.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold Tauri 2 + React/TS app with backend deps"
```

---

## Task 1: `error.rs` — typed AppError

**Files:**
- Create: `src-tauri/src/error.rs`
- Modify: `src-tauri/src/lib.rs` (add `mod error;`)
- Test: inline `#[cfg(test)]` in `error.rs`

**Interfaces:**
- Produces: `pub enum AppError` with variants `ConnectionFailed(String)`, `AuthFailed(String)`, `QueryError { message: String, position: Option<u32> }`, `Timeout`, `Canceled`, `NotFound(String)`, `Internal(String)`. Implements `Serialize` (tagged), `Display` (thiserror), and `From<sqlx::Error>`. Alias `pub type AppResult<T> = Result<T, AppError>;`

- [ ] **Step 1: Write the failing test**

```rust
// in src-tauri/src/error.rs
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_query_error_as_camelcase_tagged() {
        let e = AppError::QueryError { message: "boom".into(), position: Some(12) };
        let v = serde_json::to_value(&e).unwrap();
        assert_eq!(v["kind"], "queryError");
        assert_eq!(v["message"], "boom");
        assert_eq!(v["position"], 12);
    }

    #[test]
    fn maps_sqlx_rownotfound_to_notfound() {
        let app: AppError = sqlx::Error::RowNotFound.into();
        assert!(matches!(app, AppError::NotFound(_)));
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd src-tauri && cargo test error::`
Expected: FAIL — `AppError` not defined.

- [ ] **Step 3: Implement**

```rust
use serde::Serialize;

pub type AppResult<T> = Result<T, AppError>;

#[derive(Debug, thiserror::Error, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum AppError {
    #[error("connection failed: {0}")]
    ConnectionFailed(String),
    #[error("authentication failed: {0}")]
    AuthFailed(String),
    #[error("query error: {message}")]
    QueryError { message: String, position: Option<u32> },
    #[error("operation timed out")]
    Timeout,
    #[error("operation canceled")]
    Canceled,
    #[error("not found: {0}")]
    NotFound(String),
    #[error("internal error: {0}")]
    Internal(String),
}

impl From<sqlx::Error> for AppError {
    fn from(e: sqlx::Error) -> Self {
        match e {
            sqlx::Error::RowNotFound => AppError::NotFound("row not found".into()),
            sqlx::Error::Database(db) => AppError::QueryError { message: db.message().to_string(), position: None },
            sqlx::Error::PoolTimedOut => AppError::Timeout,
            other => AppError::ConnectionFailed(other.to_string()),
        }
    }
}
```

Add `mod error;` to `lib.rs`.

- [ ] **Step 4: Run to verify it passes**

Run: `cd src-tauri && cargo test error::`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(core): typed AppError with sqlx mapping and camelCase serialization"
```

---

## Task 2: `types.rs` — shared DTOs

**Files:**
- Create: `src-tauri/src/types.rs`
- Modify: `src-tauri/src/lib.rs` (add `mod types;`)
- Test: inline tests in `types.rs`

**Interfaces:**
- Produces:
  - `enum Engine { Postgres, MySql, Sqlite }` serializing as `"postgres"|"mysql"|"sqlite"`, with `Engine::from_str`.
  - `struct ConnectionConfig { id: String, name: String, engine: Engine, host: Option<String>, port: Option<u16>, database: String, username: Option<String> }` (no password field).
  - `struct Column { name: String, data_type: String }`
  - `struct QueryResult { columns: Vec<Column>, rows: Vec<Vec<serde_json::Value>>, rows_affected: u64, elapsed_ms: u64, truncated: bool }`
  - `struct TableInfo { name: String, kind: String, schema: Option<String> }`
  - `struct ColumnInfo { name: String, data_type: String, nullable: bool, is_primary_key: bool }`
  - `const MAX_ROWS: usize = 50_000;`

- [ ] **Step 1: Write the failing test**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn engine_serializes_lowercase() {
        assert_eq!(serde_json::to_value(Engine::MySql).unwrap(), serde_json::json!("mysql"));
        assert_eq!("sqlite".parse::<Engine>().unwrap(), Engine::Sqlite);
    }
    #[test]
    fn connection_config_has_no_password_field() {
        let json = serde_json::json!({
            "id":"a","name":"local","engine":"sqlite","database":"/tmp/x.db"
        });
        let cfg: ConnectionConfig = serde_json::from_value(json).unwrap();
        assert_eq!(cfg.engine, Engine::Sqlite);
        assert!(cfg.host.is_none());
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd src-tauri && cargo test types::`
Expected: FAIL — types not defined.

- [ ] **Step 3: Implement**

```rust
use serde::{Deserialize, Serialize};
use std::str::FromStr;
use crate::error::AppError;

pub const MAX_ROWS: usize = 50_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Engine { Postgres, MySql, Sqlite }

impl FromStr for Engine {
    type Err = AppError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "postgres" | "postgresql" => Ok(Engine::Postgres),
            "mysql" | "mariadb" => Ok(Engine::MySql),
            "sqlite" => Ok(Engine::Sqlite),
            other => Err(AppError::Internal(format!("unknown engine: {other}"))),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionConfig {
    pub id: String,
    pub name: String,
    pub engine: Engine,
    #[serde(default)] pub host: Option<String>,
    #[serde(default)] pub port: Option<u16>,
    pub database: String,
    #[serde(default)] pub username: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Column { pub name: String, pub data_type: String }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryResult {
    pub columns: Vec<Column>,
    pub rows: Vec<Vec<serde_json::Value>>,
    pub rows_affected: u64,
    pub elapsed_ms: u64,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TableInfo { pub name: String, pub kind: String, pub schema: Option<String> }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ColumnInfo {
    pub name: String, pub data_type: String, pub nullable: bool, pub is_primary_key: bool,
}
```

Add `mod types;` to `lib.rs`.

- [ ] **Step 4: Run to verify it passes**

Run: `cd src-tauri && cargo test types::`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(core): shared DTOs (Engine, ConnectionConfig, QueryResult, schema types)"
```

---

## Task 3: `drivers` — Driver trait + SQLite connect/test

**Files:**
- Create: `src-tauri/src/drivers/mod.rs`, `src-tauri/src/drivers/sqlite.rs`
- Modify: `src-tauri/src/lib.rs` (add `mod drivers;`)
- Test: inline tests in `sqlite.rs`

**Interfaces:**
- Consumes: `types::{ConnectionConfig, QueryResult, TableInfo, ColumnInfo, Engine}`, `error::AppResult`.
- Produces:
  - `#[async_trait] pub trait Driver: Send + Sync { async fn execute(&self, sql: &str) -> AppResult<QueryResult>; async fn list_tables(&self) -> AppResult<Vec<TableInfo>>; async fn list_columns(&self, table: &str) -> AppResult<Vec<ColumnInfo>>; }`
  - `pub struct SqliteDriver { pool: sqlx::SqlitePool }`
  - `impl SqliteDriver { pub async fn connect(cfg: &ConnectionConfig) -> AppResult<Self>; pub async fn test(cfg: &ConnectionConfig) -> AppResult<()>; }`
  - Helper `pub fn sqlite_url(database: &str) -> String` → `"sqlite:{path}?mode=rwc"` (`:memory:` passes through as `"sqlite::memory:"`).

- [ ] **Step 1: Write the failing test**

```rust
// src-tauri/src/drivers/sqlite.rs
#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{ConnectionConfig, Engine};

    fn mem_cfg() -> ConnectionConfig {
        ConnectionConfig { id: "t".into(), name: "mem".into(), engine: Engine::Sqlite,
            host: None, port: None, database: ":memory:".into(), username: None }
    }

    #[tokio::test]
    async fn connects_and_tests_inmemory() {
        SqliteDriver::test(&mem_cfg()).await.unwrap();
        let d = SqliteDriver::connect(&mem_cfg()).await.unwrap();
        d.execute("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)").await.unwrap();
        let r = d.execute("INSERT INTO t (name) VALUES ('a'),('b')").await.unwrap();
        assert_eq!(r.rows_affected, 2);
    }
}
```

(`unwrap` is allowed in tests.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd src-tauri && cargo test drivers::sqlite`
Expected: FAIL — `SqliteDriver` not defined.

- [ ] **Step 3: Implement the trait (`drivers/mod.rs`)**

```rust
pub mod sqlite;

use async_trait::async_trait;
use crate::error::AppResult;
use crate::types::{ColumnInfo, QueryResult, TableInfo};

#[async_trait]
pub trait Driver: Send + Sync {
    async fn execute(&self, sql: &str) -> AppResult<QueryResult>;
    async fn list_tables(&self) -> AppResult<Vec<TableInfo>>;
    async fn list_columns(&self, table: &str) -> AppResult<Vec<ColumnInfo>>;
}
```

- [ ] **Step 4: Implement `SqliteDriver::connect/test` + `sqlite_url` (`drivers/sqlite.rs`)**

```rust
use sqlx::sqlite::SqlitePoolOptions;
use crate::error::AppResult;
use crate::types::ConnectionConfig;

pub struct SqliteDriver { pub(crate) pool: sqlx::SqlitePool }

pub fn sqlite_url(database: &str) -> String {
    if database == ":memory:" { "sqlite::memory:".to_string() }
    else { format!("sqlite:{database}?mode=rwc") }
}

impl SqliteDriver {
    pub async fn connect(cfg: &ConnectionConfig) -> AppResult<Self> {
        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect(&sqlite_url(&cfg.database))
            .await?;
        Ok(Self { pool })
    }
    pub async fn test(cfg: &ConnectionConfig) -> AppResult<()> {
        let pool = SqlitePoolOptions::new().max_connections(1)
            .connect(&sqlite_url(&cfg.database)).await?;
        sqlx::query("SELECT 1").execute(&pool).await?;
        pool.close().await;
        Ok(())
    }
}
```

(`execute`, `list_tables`, `list_columns` impls land in Tasks 4 and 5 — until then add a temporary `#[async_trait] impl Driver for SqliteDriver` with `execute` only, or keep the test calling the inherent method. To keep this task green, implement the `execute` inherent method now and move the trait impl to Task 4.)

Add inherent `execute` to make the test pass:

```rust
impl SqliteDriver {
    pub async fn execute(&self, sql: &str) -> AppResult<crate::types::QueryResult> {
        let started = std::time::Instant::now();
        let res = sqlx::query(sql).execute(&self.pool).await?;
        Ok(crate::types::QueryResult {
            columns: vec![], rows: vec![],
            rows_affected: res.rows_affected(),
            elapsed_ms: started.elapsed().as_millis() as u64,
            truncated: false,
        })
    }
}
```

Add `mod drivers;` to `lib.rs`.

- [ ] **Step 5: Run to verify it passes**

Run: `cd src-tauri && cargo test drivers::sqlite`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(drivers): Driver trait + SQLite connect/test/execute"
```

---

## Task 4: `executor` — run SELECT, map rows to JSON

**Files:**
- Create: `src-tauri/src/executor/mod.rs`
- Modify: `src-tauri/src/drivers/sqlite.rs` (full trait impl with row mapping), `lib.rs` (`mod executor;`)
- Test: inline tests in `executor/mod.rs`

**Interfaces:**
- Consumes: `drivers::Driver`, `types::{QueryResult, Column, MAX_ROWS}`.
- Produces: `pub fn sqlite_row_to_values(row: &sqlx::sqlite::SqliteRow) -> AppResult<Vec<serde_json::Value>>` and the full `impl Driver for SqliteDriver` whose `execute` returns rows + columns for SELECTs, capping at `MAX_ROWS` and setting `truncated`.

- [ ] **Step 1: Write the failing test**

```rust
// src-tauri/src/executor/mod.rs
#[cfg(test)]
mod tests {
    use crate::drivers::{sqlite::SqliteDriver, Driver};
    use crate::types::{ConnectionConfig, Engine};

    async fn seeded() -> SqliteDriver {
        let cfg = ConnectionConfig { id:"t".into(), name:"m".into(), engine:Engine::Sqlite,
            host:None, port:None, database:":memory:".into(), username:None };
        let d = SqliteDriver::connect(&cfg).await.unwrap();
        d.execute("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT, score REAL, flag BOOLEAN)").await.unwrap();
        d.execute("INSERT INTO t (name, score, flag) VALUES ('a', 1.5, 1), ('b', NULL, 0)").await.unwrap();
        d
    }

    #[tokio::test]
    async fn select_returns_columns_and_typed_rows() {
        let d = seeded().await;
        let r = d.execute("SELECT id, name, score FROM t ORDER BY id").await.unwrap();
        assert_eq!(r.columns.iter().map(|c| c.name.as_str()).collect::<Vec<_>>(), vec!["id","name","score"]);
        assert_eq!(r.rows.len(), 2);
        assert_eq!(r.rows[0][1], serde_json::json!("a"));
        assert_eq!(r.rows[1][2], serde_json::Value::Null); // NULL score
        assert!(!r.truncated);
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd src-tauri && cargo test executor::`
Expected: FAIL — `execute` returns empty rows/columns (current Task 3 stub).

- [ ] **Step 3: Implement row mapping in `executor/mod.rs`**

```rust
use sqlx::{Column as _, Row, TypeInfo, ValueRef};
use crate::error::AppResult;

pub fn sqlite_row_to_values(row: &sqlx::sqlite::SqliteRow) -> AppResult<Vec<serde_json::Value>> {
    let mut out = Vec::with_capacity(row.len());
    for i in 0..row.len() {
        let raw = row.try_get_raw(i).map_err(|e| crate::error::AppError::Internal(e.to_string()))?;
        if raw.is_null() { out.push(serde_json::Value::Null); continue; }
        let type_name = raw.type_info().name().to_uppercase();
        let v = match type_name.as_str() {
            "INTEGER" | "BIGINT" | "INT" => row.try_get::<i64, _>(i).map(|x| serde_json::json!(x)),
            "REAL" | "FLOAT" | "DOUBLE" => row.try_get::<f64, _>(i).map(|x| serde_json::json!(x)),
            "BOOLEAN" => row.try_get::<bool, _>(i).map(|x| serde_json::json!(x)),
            "BLOB" => row.try_get::<Vec<u8>, _>(i).map(|b| serde_json::json!(format!("\\x{}", hex(&b)))),
            _ => row.try_get::<String, _>(i).map(|x| serde_json::json!(x)),
        }.unwrap_or(serde_json::Value::Null);
        out.push(v);
    }
    Ok(out)
}

fn hex(b: &[u8]) -> String { b.iter().map(|x| format!("{x:02x}")).collect() }
```

- [ ] **Step 4: Replace SQLite `execute` with the full trait impl (`drivers/sqlite.rs`)**

Remove the inherent `execute` from Task 3 and add:

```rust
use async_trait::async_trait;
use sqlx::{Column as _, Row};
use crate::drivers::Driver;
use crate::executor::sqlite_row_to_values;
use crate::types::{Column, ColumnInfo, QueryResult, TableInfo, MAX_ROWS};

#[async_trait]
impl Driver for SqliteDriver {
    async fn execute(&self, sql: &str) -> AppResult<QueryResult> {
        let started = std::time::Instant::now();
        let trimmed = sql.trim_start().to_uppercase();
        let is_select = trimmed.starts_with("SELECT") || trimmed.starts_with("PRAGMA") || trimmed.starts_with("WITH");
        if !is_select {
            let res = sqlx::query(sql).execute(&self.pool).await?;
            return Ok(QueryResult { columns: vec![], rows: vec![], rows_affected: res.rows_affected(),
                elapsed_ms: started.elapsed().as_millis() as u64, truncated: false });
        }
        let fetched = sqlx::query(sql).fetch_all(&self.pool).await?;
        let mut columns = vec![];
        if let Some(first) = fetched.first() {
            columns = first.columns().iter().map(|c| Column { name: c.name().to_string(),
                data_type: format!("{:?}", c.type_info()) }).collect();
        }
        let truncated = fetched.len() > MAX_ROWS;
        let mut rows = Vec::with_capacity(fetched.len().min(MAX_ROWS));
        for row in fetched.iter().take(MAX_ROWS) { rows.push(sqlite_row_to_values(row)?); }
        Ok(QueryResult { columns, rows, rows_affected: 0,
            elapsed_ms: started.elapsed().as_millis() as u64, truncated })
    }

    async fn list_tables(&self) -> AppResult<Vec<TableInfo>> { Ok(vec![]) }      // Task 5
    async fn list_columns(&self, _t: &str) -> AppResult<Vec<ColumnInfo>> { Ok(vec![]) } // Task 5
}
```

Add `mod executor;` to `lib.rs`.

- [ ] **Step 5: Run to verify it passes**

Run: `cd src-tauri && cargo test`
Expected: PASS (drivers + executor tests).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(executor): SQLite SELECT execution with dynamic JSON row mapping + row cap"
```

---

## Task 5: `schema` — SQLite introspection

**Files:**
- Create: `src-tauri/src/schema/mod.rs`
- Modify: `src-tauri/src/drivers/sqlite.rs` (implement `list_tables` / `list_columns`), `lib.rs` (`mod schema;`)
- Test: inline tests in `drivers/sqlite.rs`

**Interfaces:**
- Consumes: `types::{TableInfo, ColumnInfo}`.
- Produces: SQLite `list_tables` (from `sqlite_master`) and `list_columns` (from `PRAGMA table_info`). `schema/mod.rs` exposes `pub async fn introspect_tables(driver: &dyn Driver) -> AppResult<Vec<TableInfo>>` and `pub async fn introspect_columns(driver: &dyn Driver, table: &str) -> AppResult<Vec<ColumnInfo>>` (thin pass-throughs that later commands call).

- [ ] **Step 1: Write the failing test**

```rust
// add to src-tauri/src/drivers/sqlite.rs tests module
#[tokio::test]
async fn introspects_tables_and_columns() {
    let cfg = mem_cfg();
    let d = SqliteDriver::connect(&cfg).await.unwrap();
    d.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL)").await.unwrap();
    d.execute("CREATE VIEW v AS SELECT id FROM users").await.unwrap();
    let tables = d.list_tables().await.unwrap();
    assert!(tables.iter().any(|t| t.name == "users" && t.kind == "table"));
    assert!(tables.iter().any(|t| t.name == "v" && t.kind == "view"));
    let cols = d.list_columns("users").await.unwrap();
    let id = cols.iter().find(|c| c.name == "id").unwrap();
    assert!(id.is_primary_key);
    let email = cols.iter().find(|c| c.name == "email").unwrap();
    assert!(!email.nullable);
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd src-tauri && cargo test drivers::sqlite`
Expected: FAIL — `list_tables` returns empty.

- [ ] **Step 3: Implement introspection in `drivers/sqlite.rs`** (replace the Task 4 stubs):

```rust
async fn list_tables(&self) -> AppResult<Vec<TableInfo>> {
    let rows = sqlx::query(
        "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name")
        .fetch_all(&self.pool).await?;
    Ok(rows.iter().map(|r| TableInfo {
        name: r.get::<String, _>("name"),
        kind: r.get::<String, _>("type"),
        schema: None,
    }).collect())
}

async fn list_columns(&self, table: &str) -> AppResult<Vec<ColumnInfo>> {
    // PRAGMA cannot bind params; guard the identifier and inline it.
    if !table.chars().all(|c| c.is_alphanumeric() || c == '_') {
        return Err(crate::error::AppError::Internal("invalid table name".into()));
    }
    let rows = sqlx::query(&format!("PRAGMA table_info({table})")).fetch_all(&self.pool).await?;
    Ok(rows.iter().map(|r| ColumnInfo {
        name: r.get::<String, _>("name"),
        data_type: r.get::<String, _>("type"),
        nullable: r.get::<i64, _>("notnull") == 0,
        is_primary_key: r.get::<i64, _>("pk") > 0,
    }).collect())
}
```

- [ ] **Step 4: Implement `schema/mod.rs` pass-throughs**

```rust
use crate::drivers::Driver;
use crate::error::AppResult;
use crate::types::{ColumnInfo, TableInfo};

pub async fn introspect_tables(driver: &dyn Driver) -> AppResult<Vec<TableInfo>> {
    driver.list_tables().await
}
pub async fn introspect_columns(driver: &dyn Driver, table: &str) -> AppResult<Vec<ColumnInfo>> {
    driver.list_columns(table).await
}
```

Add `mod schema;` to `lib.rs`.

- [ ] **Step 5: Run to verify it passes**

Run: `cd src-tauri && cargo test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(schema): SQLite table/view + column introspection"
```

---

## Task 6: `store` — persist saved connections + query history

**Files:**
- Create: `src-tauri/src/store/mod.rs`
- Modify: `lib.rs` (`mod store;`)
- Test: inline tests in `store/mod.rs`

**Interfaces:**
- Consumes: `types::ConnectionConfig`, `error::AppResult`.
- Produces: `pub struct Store { pool: sqlx::SqlitePool }` with:
  - `pub async fn open(db_path: &str) -> AppResult<Self>` (runs migrations: `connections`, `query_history` tables).
  - `pub async fn list_connections(&self) -> AppResult<Vec<ConnectionConfig>>`
  - `pub async fn upsert_connection(&self, cfg: &ConnectionConfig) -> AppResult<()>`
  - `pub async fn delete_connection(&self, id: &str) -> AppResult<()>`
  - `pub async fn add_history(&self, connection_id: &str, sql: &str) -> AppResult<()>`
  - `pub async fn recent_history(&self, limit: i64) -> AppResult<Vec<HistoryEntry>>` where `HistoryEntry { id: i64, connection_id: String, sql: String, ran_at: String }` (camelCase serde).

- [ ] **Step 1: Write the failing test**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{ConnectionConfig, Engine};

    #[tokio::test]
    async fn roundtrips_connections_and_history() {
        let store = Store::open(":memory:").await.unwrap();
        let cfg = ConnectionConfig { id:"c1".into(), name:"local pg".into(), engine:Engine::Postgres,
            host:Some("localhost".into()), port:Some(5432), database:"app".into(), username:Some("me".into()) };
        store.upsert_connection(&cfg).await.unwrap();
        let list = store.list_connections().await.unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, "local pg");

        store.add_history("c1", "SELECT 1").await.unwrap();
        store.add_history("c1", "SELECT 2").await.unwrap();
        let h = store.recent_history(10).await.unwrap();
        assert_eq!(h.len(), 2);
        assert_eq!(h[0].sql, "SELECT 2"); // newest first

        store.delete_connection("c1").await.unwrap();
        assert!(store.list_connections().await.unwrap().is_empty());
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd src-tauri && cargo test store::`
Expected: FAIL — `Store` not defined.

- [ ] **Step 3: Implement `store/mod.rs`**

```rust
use serde::Serialize;
use sqlx::{sqlite::SqlitePoolOptions, Row};
use crate::error::AppResult;
use crate::types::{ConnectionConfig, Engine};

pub struct Store { pool: sqlx::SqlitePool }

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry { pub id: i64, pub connection_id: String, pub sql: String, pub ran_at: String }

impl Store {
    pub async fn open(db_path: &str) -> AppResult<Self> {
        let url = if db_path == ":memory:" { "sqlite::memory:".to_string() }
                  else { format!("sqlite:{db_path}?mode=rwc") };
        let pool = SqlitePoolOptions::new().max_connections(1).connect(&url).await?;
        sqlx::query(
            "CREATE TABLE IF NOT EXISTS connections (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, engine TEXT NOT NULL,
                host TEXT, port INTEGER, database TEXT NOT NULL, username TEXT)")
            .execute(&pool).await?;
        sqlx::query(
            "CREATE TABLE IF NOT EXISTS query_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT, connection_id TEXT NOT NULL,
                sql TEXT NOT NULL, ran_at TEXT NOT NULL DEFAULT (datetime('now')))")
            .execute(&pool).await?;
        Ok(Self { pool })
    }

    pub async fn list_connections(&self) -> AppResult<Vec<ConnectionConfig>> {
        let rows = sqlx::query("SELECT id,name,engine,host,port,database,username FROM connections ORDER BY name")
            .fetch_all(&self.pool).await?;
        let mut out = vec![];
        for r in rows {
            out.push(ConnectionConfig {
                id: r.get("id"), name: r.get("name"),
                engine: r.get::<String,_>("engine").parse::<Engine>()?,
                host: r.get("host"), port: r.get::<Option<i64>,_>("port").map(|p| p as u16),
                database: r.get("database"), username: r.get("username"),
            });
        }
        Ok(out)
    }

    pub async fn upsert_connection(&self, cfg: &ConnectionConfig) -> AppResult<()> {
        sqlx::query(
            "INSERT INTO connections (id,name,engine,host,port,database,username)
             VALUES (?1,?2,?3,?4,?5,?6,?7)
             ON CONFLICT(id) DO UPDATE SET name=?2,engine=?3,host=?4,port=?5,database=?6,username=?7")
            .bind(&cfg.id).bind(&cfg.name)
            .bind(serde_json::to_value(cfg.engine)?.as_str().unwrap_or("sqlite"))
            .bind(&cfg.host).bind(cfg.port.map(|p| p as i64))
            .bind(&cfg.database).bind(&cfg.username)
            .execute(&self.pool).await?;
        Ok(())
    }

    pub async fn delete_connection(&self, id: &str) -> AppResult<()> {
        sqlx::query("DELETE FROM connections WHERE id=?1").bind(id).execute(&self.pool).await?;
        Ok(())
    }

    pub async fn add_history(&self, connection_id: &str, sql: &str) -> AppResult<()> {
        sqlx::query("INSERT INTO query_history (connection_id, sql) VALUES (?1,?2)")
            .bind(connection_id).bind(sql).execute(&self.pool).await?;
        Ok(())
    }

    pub async fn recent_history(&self, limit: i64) -> AppResult<Vec<HistoryEntry>> {
        let rows = sqlx::query("SELECT id,connection_id,sql,ran_at FROM query_history ORDER BY id DESC LIMIT ?1")
            .bind(limit).fetch_all(&self.pool).await?;
        Ok(rows.iter().map(|r| HistoryEntry {
            id: r.get("id"), connection_id: r.get("connection_id"),
            sql: r.get("sql"), ran_at: r.get("ran_at"),
        }).collect())
    }
}
```

Map `serde_json::Error` in `AppError`: add `#[error("serialization: {0}")] Serde(String)` variant and `impl From<serde_json::Error>`, OR replace the `serde_json::to_value(cfg.engine)?` line with a direct match `match cfg.engine { Engine::Postgres => "postgres", Engine::MySql => "mysql", Engine::Sqlite => "sqlite" }`. **Use the match** — simpler, no new error variant:

```rust
let engine_str = match cfg.engine { Engine::Postgres => "postgres", Engine::MySql => "mysql", Engine::Sqlite => "sqlite" };
// ...bind(engine_str)...
```

Add `mod store;` to `lib.rs`.

- [ ] **Step 4: Run to verify it passes**

Run: `cd src-tauri && cargo test store::`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(store): SQLite-backed persistence for connections and query history"
```

---

## Task 7: `secrets` — OS keychain wrapper

**Files:**
- Create: `src-tauri/src/secrets/mod.rs`
- Modify: `lib.rs` (`mod secrets;`)
- Test: inline test (guarded — keychain may be unavailable in CI)

**Interfaces:**
- Consumes: `error::AppResult`.
- Produces: `pub fn set_password(connection_id: &str, password: &str) -> AppResult<()>`, `pub fn get_password(connection_id: &str) -> AppResult<Option<String>>`, `pub fn delete_password(connection_id: &str) -> AppResult<()>`. Service name `"MamaSQL"`, account = connection id.

- [ ] **Step 1: Write the failing test** (ignored by default so CI without a keychain passes):

```rust
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[ignore = "requires an OS keychain; run locally with --ignored"]
    fn set_get_delete_roundtrip() {
        let id = "test-conn-xyz";
        set_password(id, "s3cret").unwrap();
        assert_eq!(get_password(id).unwrap().as_deref(), Some("s3cret"));
        delete_password(id).unwrap();
        assert_eq!(get_password(id).unwrap(), None);
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd src-tauri && cargo test secrets:: -- --ignored`
Expected: FAIL — functions not defined.

- [ ] **Step 3: Implement `secrets/mod.rs`**

```rust
use keyring::Entry;
use crate::error::{AppError, AppResult};

const SERVICE: &str = "MamaSQL";

fn entry(connection_id: &str) -> AppResult<Entry> {
    Entry::new(SERVICE, connection_id).map_err(|e| AppError::Internal(e.to_string()))
}

pub fn set_password(connection_id: &str, password: &str) -> AppResult<()> {
    entry(connection_id)?.set_password(password).map_err(|e| AppError::Internal(e.to_string()))
}

pub fn get_password(connection_id: &str) -> AppResult<Option<String>> {
    match entry(connection_id)?.get_password() {
        Ok(p) => Ok(Some(p)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(AppError::Internal(e.to_string())),
    }
}

pub fn delete_password(connection_id: &str) -> AppResult<()> {
    match entry(connection_id)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(AppError::Internal(e.to_string())),
    }
}
```

Add `mod secrets;` to `lib.rs`.

- [ ] **Step 4: Run to verify it passes**

Run: `cd src-tauri && cargo test secrets:: -- --ignored` (locally)
Expected: PASS. In CI, the non-ignored suite must still compile: `cargo test secrets::` → 0 run, builds clean.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(secrets): OS keychain wrapper via keyring crate"
```

---

## Task 8: `connections` registry — live pools in Tauri state

**Files:**
- Create: `src-tauri/src/connections/mod.rs`
- Modify: `lib.rs` (`mod connections;`)
- Test: inline tests in `connections/mod.rs`

**Interfaces:**
- Consumes: `drivers::{Driver, sqlite::SqliteDriver}`, `types::{ConnectionConfig, Engine}`, `error::{AppError, AppResult}`.
- Produces: `pub struct ConnectionRegistry { live: tokio::sync::RwLock<HashMap<String, Arc<dyn Driver>>> }` with:
  - `pub fn new() -> Self`
  - `pub async fn open(&self, cfg: &ConnectionConfig, password: Option<&str>) -> AppResult<()>` (builds the right driver by `cfg.engine`; v1 supports Sqlite — Postgres/MySQL arms return `AppError::Internal("engine not yet supported")` until Plan 3).
  - `pub async fn get(&self, id: &str) -> AppResult<Arc<dyn Driver>>` (errors `NotFound` if not open).
  - `pub async fn close(&self, id: &str)`

- [ ] **Step 1: Write the failing test**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{ConnectionConfig, Engine};

    fn cfg() -> ConnectionConfig {
        ConnectionConfig { id:"c1".into(), name:"m".into(), engine:Engine::Sqlite,
            host:None, port:None, database:":memory:".into(), username:None }
    }

    #[tokio::test]
    async fn opens_gets_and_closes() {
        let reg = ConnectionRegistry::new();
        reg.open(&cfg(), None).await.unwrap();
        let d = reg.get("c1").await.unwrap();
        d.execute("SELECT 1").await.unwrap();
        reg.close("c1").await;
        assert!(reg.get("c1").await.is_err());
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd src-tauri && cargo test connections::`
Expected: FAIL — `ConnectionRegistry` not defined.

- [ ] **Step 3: Implement `connections/mod.rs`**

```rust
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use crate::drivers::{sqlite::SqliteDriver, Driver};
use crate::error::{AppError, AppResult};
use crate::types::{ConnectionConfig, Engine};

pub struct ConnectionRegistry { live: RwLock<HashMap<String, Arc<dyn Driver>>> }

impl ConnectionRegistry {
    pub fn new() -> Self { Self { live: RwLock::new(HashMap::new()) } }

    pub async fn open(&self, cfg: &ConnectionConfig, _password: Option<&str>) -> AppResult<()> {
        let driver: Arc<dyn Driver> = match cfg.engine {
            Engine::Sqlite => Arc::new(SqliteDriver::connect(cfg).await?),
            Engine::Postgres | Engine::MySql =>
                return Err(AppError::Internal("engine not yet supported (see Plan 3)".into())),
        };
        self.live.write().await.insert(cfg.id.clone(), driver);
        Ok(())
    }

    pub async fn get(&self, id: &str) -> AppResult<Arc<dyn Driver>> {
        self.live.read().await.get(id).cloned()
            .ok_or_else(|| AppError::NotFound(format!("connection not open: {id}")))
    }

    pub async fn close(&self, id: &str) { self.live.write().await.remove(id); }
}

impl Default for ConnectionRegistry { fn default() -> Self { Self::new() } }
```

Add `mod connections;` to `lib.rs`.

- [ ] **Step 4: Run to verify it passes**

Run: `cd src-tauri && cargo test connections::`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(connections): live pool registry keyed by connection id"
```

---

## Task 9: `commands` — Tauri command layer + app wiring

**Files:**
- Create: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs` (managed state + `invoke_handler`)
- Test: inline unit test for the streaming chunk helper; manual smoke for the full IPC.

**Interfaces:**
- Consumes: everything above.
- Produces these `#[tauri::command]`s (all `async`, all `Result<_, AppError>` except where noted):
  - `list_connections(store) -> Vec<ConnectionConfig>`
  - `save_connection(store, cfg: ConnectionConfig, password: Option<String>) -> ()` (persists cfg via store; if password is `Some`, writes to keychain)
  - `delete_connection(store, id: String) -> ()` (store delete + keychain delete)
  - `test_connection(cfg: ConnectionConfig, password: Option<String>) -> ()`
  - `open_connection(registry, store, id: String) -> ()` (loads cfg from store, password from keychain, opens pool)
  - `close_connection(registry, id: String) -> ()`
  - `run_query(registry, store, app, connection_id: String, sql: String) -> QueryResult` (executes, records history, returns result)
  - `list_tables(registry, connection_id: String) -> Vec<TableInfo>`
  - `list_columns(registry, connection_id: String, table: String) -> Vec<ColumnInfo>`
  - `recent_history(store, limit: i64) -> Vec<HistoryEntry>`
- App state: `AppState { registry: ConnectionRegistry, store: Store }` managed via `tauri::Manager::manage`.
- Chunk helper (testable without Tauri): `pub fn chunk_rows(rows: &[Vec<serde_json::Value>], size: usize) -> Vec<&[Vec<serde_json::Value>]>`.

- [ ] **Step 1: Write the failing test** (chunk helper):

```rust
// src-tauri/src/commands/mod.rs
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn chunks_rows_evenly_with_remainder() {
        let rows: Vec<Vec<serde_json::Value>> = (0..5).map(|i| vec![serde_json::json!(i)]).collect();
        let chunks = chunk_rows(&rows, 2);
        assert_eq!(chunks.len(), 3);
        assert_eq!(chunks[0].len(), 2);
        assert_eq!(chunks[2].len(), 1);
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd src-tauri && cargo test commands::`
Expected: FAIL — `chunk_rows` not defined.

- [ ] **Step 3: Implement `commands/mod.rs`**

```rust
use tauri::State;
use crate::connections::ConnectionRegistry;
use crate::error::{AppError, AppResult};
use crate::schema;
use crate::secrets;
use crate::store::{HistoryEntry, Store};
use crate::types::{ColumnInfo, ConnectionConfig, QueryResult, TableInfo};

pub struct AppState { pub registry: ConnectionRegistry, pub store: Store }

pub fn chunk_rows(rows: &[Vec<serde_json::Value>], size: usize) -> Vec<&[Vec<serde_json::Value>]> {
    if size == 0 { return vec![rows]; }
    rows.chunks(size).collect()
}

#[tauri::command]
pub async fn list_connections(state: State<'_, AppState>) -> AppResult<Vec<ConnectionConfig>> {
    state.store.list_connections().await
}

#[tauri::command]
pub async fn save_connection(state: State<'_, AppState>, cfg: ConnectionConfig, password: Option<String>) -> AppResult<()> {
    state.store.upsert_connection(&cfg).await?;
    if let Some(pw) = password { secrets::set_password(&cfg.id, &pw)?; }
    Ok(())
}

#[tauri::command]
pub async fn delete_connection(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.store.delete_connection(&id).await?;
    secrets::delete_password(&id)?;
    state.registry.close(&id).await;
    Ok(())
}

#[tauri::command]
pub async fn test_connection(cfg: ConnectionConfig, password: Option<String>) -> AppResult<()> {
    use crate::types::Engine;
    match cfg.engine {
        Engine::Sqlite => crate::drivers::sqlite::SqliteDriver::test(&cfg).await,
        _ => { let _ = password; Err(AppError::Internal("engine not yet supported (Plan 3)".into())) }
    }
}

#[tauri::command]
pub async fn open_connection(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let conns = state.store.list_connections().await?;
    let cfg = conns.into_iter().find(|c| c.id == id)
        .ok_or_else(|| AppError::NotFound(format!("no saved connection: {id}")))?;
    let pw = secrets::get_password(&id)?;
    state.registry.open(&cfg, pw.as_deref()).await
}

#[tauri::command]
pub async fn close_connection(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.registry.close(&id).await; Ok(())
}

#[tauri::command]
pub async fn run_query(state: State<'_, AppState>, connection_id: String, sql: String) -> AppResult<QueryResult> {
    let driver = state.registry.get(&connection_id).await?;
    let result = driver.execute(&sql).await?;
    let _ = state.store.add_history(&connection_id, &sql).await; // history failure must not fail the query
    Ok(result)
}

#[tauri::command]
pub async fn list_tables(state: State<'_, AppState>, connection_id: String) -> AppResult<Vec<TableInfo>> {
    let driver = state.registry.get(&connection_id).await?;
    schema::introspect_tables(driver.as_ref()).await
}

#[tauri::command]
pub async fn list_columns(state: State<'_, AppState>, connection_id: String, table: String) -> AppResult<Vec<ColumnInfo>> {
    let driver = state.registry.get(&connection_id).await?;
    schema::introspect_columns(driver.as_ref(), &table).await
}

#[tauri::command]
pub async fn recent_history(state: State<'_, AppState>, limit: i64) -> AppResult<Vec<HistoryEntry>> {
    state.store.recent_history(limit).await
}
```

- [ ] **Step 4: Wire state + handlers in `lib.rs`**

```rust
mod error; mod types; mod drivers; mod executor; mod schema; mod store; mod secrets; mod connections; mod commands;

use tauri::Manager;
use commands::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let dir = app.path().app_data_dir().expect("app data dir");
            std::fs::create_dir_all(&dir).ok();
            let db_path = dir.join("mamasql.db");
            let store = tauri::async_runtime::block_on(
                store::Store::open(db_path.to_str().expect("utf8 path"))
            ).expect("open store");
            app.manage(AppState { registry: connections::ConnectionRegistry::new(), store });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_connections, commands::save_connection, commands::delete_connection,
            commands::test_connection, commands::open_connection, commands::close_connection,
            commands::run_query, commands::list_tables, commands::list_columns, commands::recent_history,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 5: Run unit tests + full build**

Run: `cd src-tauri && cargo test && cargo build`
Expected: all tests PASS, app builds.

- [ ] **Step 6: Manual smoke (documented, run once)**

Run: `npm run tauri dev`, then in the app's devtools console:
```js
const { invoke } = window.__TAURI__.core;
await invoke('save_connection', { cfg: { id:'demo', name:'Demo', engine:'sqlite', database:':memory:' }, password:null });
await invoke('open_connection', { id:'demo' });
await invoke('run_query', { connectionId:'demo', sql:'CREATE TABLE t(id INTEGER PRIMARY KEY, name TEXT)' });
await invoke('run_query', { connectionId:'demo', sql:"INSERT INTO t(name) VALUES('hi')" });
await invoke('run_query', { connectionId:'demo', sql:'SELECT * FROM t' }); // → { columns:[...], rows:[[1,"hi"]], ... }
await invoke('list_tables', { connectionId:'demo' }); // → [{ name:'t', kind:'table', schema:null }]
```
Expected: the SELECT returns the row; `list_tables` shows `t`.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(commands): Tauri command layer + app state wiring (SQLite end-to-end)"
```

---

## Definition of Done (Plan 1)

- `cargo test` green across `error`, `types`, `drivers::sqlite`, `executor`, `schema`, `store`, `connections`, `commands`.
- `cargo build` and `npm run tauri dev` launch the app.
- The Task 9 manual smoke returns correct results for SQLite end-to-end (save → open → DDL → DML → SELECT → introspect).
- No `unwrap()`/`expect()` on any command path (startup-only exceptions in `lib.rs` are acceptable).

## Self-Review (completed by author)

- **Spec coverage:** connection mgmt (store+secrets+registry ✓), unified driver layer (`Driver` trait ✓, SQLite impl ✓; PG/MySQL deferred to Plan 3 ✓), schema introspection ✓, query execution + JSON rows + row cap ✓, query history ✓, typed errors ✓, keychain creds ✓. Streaming events: this plan ships **buffered** execution with a `MAX_ROWS` cap (spec's memory-guard); true chunked streaming via `chunk_rows` + Tauri events is wired in Plan 2 where the consuming grid exists. Export CSV/JSON and editor/grid/autocomplete are frontend → Plan 2.
- **Placeholder scan:** none — every step has concrete code/commands.
- **Type consistency:** `ConnectionConfig`, `QueryResult`, `Column(Info)`, `TableInfo`, `HistoryEntry`, `Driver`, `ConnectionRegistry`, `Store`, `AppState`, `AppError`/`AppResult` used consistently across tasks; engine strings lowercase throughout; command params match the smoke test's camelCase keys (`connectionId`).
