use async_trait::async_trait;
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
use sqlx::{Column as _, Row, TypeInfo};
use std::collections::HashSet;

use crate::drivers::Driver;
use crate::error::AppResult;
use crate::executor::pg_row_to_values;
use crate::types::{Column, ColumnInfo, ConnectionConfig, QueryResult, TableInfo, MAX_ROWS};

pub struct PgDriver {
    pool: sqlx::PgPool,
}

fn options(cfg: &ConnectionConfig, password: Option<&str>) -> PgConnectOptions {
    let mut o = PgConnectOptions::new()
        .host(cfg.host.as_deref().unwrap_or("localhost"))
        .port(cfg.port.unwrap_or(5432))
        .database(&cfg.database);
    if let Some(u) = cfg.username.as_deref() {
        o = o.username(u);
    }
    if let Some(p) = password {
        o = o.password(p);
    }
    o
}

impl PgDriver {
    pub async fn connect(cfg: &ConnectionConfig, password: Option<&str>) -> AppResult<Self> {
        let pool = PgPoolOptions::new()
            .max_connections(5)
            .connect_with(options(cfg, password))
            .await?;
        Ok(Self { pool })
    }

    pub async fn test(cfg: &ConnectionConfig, password: Option<&str>) -> AppResult<()> {
        let pool = PgPoolOptions::new()
            .max_connections(1)
            .connect_with(options(cfg, password))
            .await?;
        sqlx::query("SELECT 1").execute(&pool).await?;
        pool.close().await;
        Ok(())
    }
}

#[async_trait]
impl Driver for PgDriver {
    async fn execute(&self, sql: &str) -> AppResult<QueryResult> {
        let started = std::time::Instant::now();
        let head = sql.trim_start().to_uppercase();
        let returns_rows = head.starts_with("SELECT")
            || head.starts_with("WITH")
            || head.starts_with("SHOW")
            || head.starts_with("TABLE")
            || head.starts_with("VALUES")
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
            rows.push(pg_row_to_values(row)?);
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
            "SELECT table_name, table_type, table_schema FROM information_schema.tables \
             WHERE table_schema NOT IN ('pg_catalog','information_schema') \
             ORDER BY table_schema, table_name",
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(rows
            .iter()
            .map(|r| {
                let table_type: String = r.try_get("table_type").unwrap_or_default();
                let kind = if table_type == "VIEW" { "view" } else { "table" };
                TableInfo {
                    name: r.try_get("table_name").unwrap_or_default(),
                    kind: kind.to_string(),
                    schema: r.try_get("table_schema").ok(),
                }
            })
            .collect())
    }

    async fn list_columns(&self, table: &str) -> AppResult<Vec<ColumnInfo>> {
        let pk_rows = sqlx::query(
            "SELECT kcu.column_name FROM information_schema.table_constraints tc \
             JOIN information_schema.key_column_usage kcu \
               ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema \
             WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_name = $1 \
               AND tc.table_schema NOT IN ('pg_catalog','information_schema')",
        )
        .bind(table)
        .fetch_all(&self.pool)
        .await?;
        let pks: HashSet<String> = pk_rows
            .iter()
            .filter_map(|r| r.try_get::<String, _>("column_name").ok())
            .collect();

        let rows = sqlx::query(
            "SELECT column_name, data_type, is_nullable FROM information_schema.columns \
             WHERE table_name = $1 AND table_schema NOT IN ('pg_catalog','information_schema') \
             ORDER BY ordinal_position",
        )
        .bind(table)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows
            .iter()
            .map(|r| {
                let name: String = r.try_get("column_name").unwrap_or_default();
                ColumnInfo {
                    is_primary_key: pks.contains(&name),
                    nullable: r
                        .try_get::<String, _>("is_nullable")
                        .map(|v| v == "YES")
                        .unwrap_or(true),
                    data_type: r
                        .try_get::<String, _>("data_type")
                        .unwrap_or_else(|_| "unknown".into()),
                    name,
                }
            })
            .collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::Engine;

    // Env-gated: runs only when MAMASQL_PG_TEST is set (so CI without a DB passes).
    fn pg_cfg() -> Option<(ConnectionConfig, Option<String>)> {
        std::env::var("MAMASQL_PG_TEST").ok()?;
        let cfg = ConnectionConfig {
            id: "pgtest".into(),
            name: "pg".into(),
            engine: Engine::Postgres,
            host: Some(std::env::var("MAMASQL_PG_HOST").unwrap_or_else(|_| "localhost".into())),
            port: Some(
                std::env::var("MAMASQL_PG_PORT")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(5432),
            ),
            database: std::env::var("MAMASQL_PG_DB").unwrap_or_else(|_| "postgres".into()),
            username: Some(std::env::var("MAMASQL_PG_USER").unwrap_or_else(|_| "postgres".into())),
        };
        Some((cfg, std::env::var("MAMASQL_PG_PASS").ok()))
    }

    #[tokio::test]
    async fn pg_integration() {
        let Some((cfg, pass)) = pg_cfg() else {
            eprintln!("skipping pg_integration (set MAMASQL_PG_TEST to run)");
            return;
        };
        PgDriver::test(&cfg, pass.as_deref()).await.unwrap();
        let d = PgDriver::connect(&cfg, pass.as_deref()).await.unwrap();

        d.execute("DROP TABLE IF EXISTS mamasql_t").await.unwrap();
        d.execute(
            "CREATE TABLE mamasql_t (id SERIAL PRIMARY KEY, name TEXT NOT NULL, score REAL, ts TIMESTAMP)",
        )
        .await
        .unwrap();
        let ins = d
            .execute("INSERT INTO mamasql_t (name, score, ts) VALUES ('a', 1.5, now()), ('b', NULL, NULL)")
            .await
            .unwrap();
        assert_eq!(ins.rows_affected, 2);

        let r = d
            .execute("SELECT id, name, score FROM mamasql_t ORDER BY id")
            .await
            .unwrap();
        assert_eq!(
            r.columns.iter().map(|c| c.name.as_str()).collect::<Vec<_>>(),
            vec!["id", "name", "score"]
        );
        assert_eq!(r.rows.len(), 2);
        assert_eq!(r.rows[0][1], serde_json::json!("a"));
        assert_eq!(r.rows[1][2], serde_json::Value::Null);

        let tables = d.list_tables().await.unwrap();
        assert!(tables.iter().any(|t| t.name == "mamasql_t"));
        let cols = d.list_columns("mamasql_t").await.unwrap();
        assert!(cols.iter().find(|c| c.name == "id").unwrap().is_primary_key);

        // Editing round-trip: UPDATE via the editing builder (string-literal PK
        // '1' must coerce against the INT column), then confirm it took.
        let upd = crate::editing::build_update(
            Engine::Postgres,
            "mamasql_t",
            "name",
            &serde_json::json!("renamed"),
            "id",
            &serde_json::json!(1),
        );
        d.execute(&upd).await.unwrap();
        let r2 = d
            .execute("SELECT name FROM mamasql_t WHERE id = 1")
            .await
            .unwrap();
        assert_eq!(r2.rows[0][0], serde_json::json!("renamed"));

        d.execute("DROP TABLE mamasql_t").await.unwrap();
    }
}
