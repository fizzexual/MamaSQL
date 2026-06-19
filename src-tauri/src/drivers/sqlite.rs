use async_trait::async_trait;
use sqlx::sqlite::SqlitePoolOptions;
use sqlx::{Column as _, Row, TypeInfo};

use crate::drivers::Driver;
use crate::error::{AppError, AppResult};
use crate::executor::sqlite_row_to_values;
use crate::types::{Column, ColumnInfo, ConnectionConfig, QueryResult, TableInfo, MAX_ROWS};

pub struct SqliteDriver {
    pub(crate) pool: sqlx::SqlitePool,
}

/// Build a sqlx connection URL. `:memory:` maps to a shared in-memory DB;
/// a file path is opened read/write, creating it if absent.
pub fn sqlite_url(database: &str) -> String {
    if database == ":memory:" {
        "sqlite::memory:".to_string()
    } else {
        format!("sqlite:{database}?mode=rwc")
    }
}

impl SqliteDriver {
    pub async fn connect(cfg: &ConnectionConfig) -> AppResult<Self> {
        // Single connection: `:memory:` databases are per-connection, and this
        // keeps the session behaving like one coherent SQL connection.
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect(&sqlite_url(&cfg.database))
            .await?;
        Ok(Self { pool })
    }

    pub async fn test(cfg: &ConnectionConfig) -> AppResult<()> {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect(&sqlite_url(&cfg.database))
            .await?;
        sqlx::query("SELECT 1").execute(&pool).await?;
        pool.close().await;
        Ok(())
    }
}

#[async_trait]
impl Driver for SqliteDriver {
    async fn execute(&self, sql: &str) -> AppResult<QueryResult> {
        let started = std::time::Instant::now();
        let head = sql.trim_start().to_uppercase();
        let returns_rows = head.starts_with("SELECT")
            || head.starts_with("PRAGMA")
            || head.starts_with("WITH")
            || head.starts_with("EXPLAIN");

        if !returns_rows {
            let res = sqlx::query(sql).execute(&self.pool).await?;
            return Ok(QueryResult {
                columns: vec![],
                rows: vec![],
                rows_affected: res.rows_affected(),
                elapsed_ms: started.elapsed().as_millis() as u64,
                truncated: false,
            });
        }

        let fetched = sqlx::query(sql).fetch_all(&self.pool).await?;
        let columns = match fetched.first() {
            Some(first) => first
                .columns()
                .iter()
                .map(|c| Column {
                    name: c.name().to_string(),
                    data_type: c.type_info().name().to_string(),
                })
                .collect(),
            None => vec![],
        };
        let truncated = fetched.len() > MAX_ROWS;
        let mut rows = Vec::with_capacity(fetched.len().min(MAX_ROWS));
        for row in fetched.iter().take(MAX_ROWS) {
            rows.push(sqlite_row_to_values(row)?);
        }
        Ok(QueryResult {
            columns,
            rows,
            rows_affected: 0,
            elapsed_ms: started.elapsed().as_millis() as u64,
            truncated,
        })
    }

    async fn list_tables(&self) -> AppResult<Vec<TableInfo>> {
        let rows = sqlx::query(
            "SELECT name, type FROM sqlite_master \
             WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(rows
            .iter()
            .map(|r| TableInfo {
                name: r.get::<String, _>("name"),
                kind: r.get::<String, _>("type"),
                schema: None,
            })
            .collect())
    }

    async fn list_columns(&self, table: &str) -> AppResult<Vec<ColumnInfo>> {
        // PRAGMA cannot bind parameters; guard the identifier before inlining.
        if table.is_empty() || !table.chars().all(|c| c.is_alphanumeric() || c == '_') {
            return Err(AppError::Internal("invalid table name".into()));
        }
        let rows = sqlx::query(&format!("PRAGMA table_info({table})"))
            .fetch_all(&self.pool)
            .await?;
        Ok(rows
            .iter()
            .map(|r| ColumnInfo {
                name: r.get::<String, _>("name"),
                data_type: r.get::<String, _>("type"),
                nullable: r.get::<i64, _>("notnull") == 0,
                is_primary_key: r.get::<i64, _>("pk") > 0,
            })
            .collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::Engine;

    fn mem_cfg() -> ConnectionConfig {
        ConnectionConfig {
            id: "t".into(),
            name: "mem".into(),
            engine: Engine::Sqlite,
            host: None,
            port: None,
            database: ":memory:".into(),
            username: None,
        }
    }

    #[tokio::test]
    async fn connects_tests_and_counts_affected() {
        SqliteDriver::test(&mem_cfg()).await.unwrap();
        let d = SqliteDriver::connect(&mem_cfg()).await.unwrap();
        d.execute("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)")
            .await
            .unwrap();
        let r = d
            .execute("INSERT INTO t (name) VALUES ('a'),('b')")
            .await
            .unwrap();
        assert_eq!(r.rows_affected, 2);
    }

    #[tokio::test]
    async fn introspects_tables_and_columns() {
        let d = SqliteDriver::connect(&mem_cfg()).await.unwrap();
        d.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL)")
            .await
            .unwrap();
        d.execute("CREATE VIEW v AS SELECT id FROM users")
            .await
            .unwrap();

        let tables = d.list_tables().await.unwrap();
        assert!(tables.iter().any(|t| t.name == "users" && t.kind == "table"));
        assert!(tables.iter().any(|t| t.name == "v" && t.kind == "view"));

        let cols = d.list_columns("users").await.unwrap();
        let id = cols.iter().find(|c| c.name == "id").unwrap();
        assert!(id.is_primary_key);
        let email = cols.iter().find(|c| c.name == "email").unwrap();
        assert!(!email.nullable);

        assert!(d.list_columns("bad; DROP").await.is_err());
    }
}
