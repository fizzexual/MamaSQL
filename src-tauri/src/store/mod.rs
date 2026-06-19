use crate::error::AppResult;
use crate::types::{ConnectionConfig, Engine};
use serde::Serialize;
use sqlx::sqlite::SqlitePoolOptions;
use sqlx::Row;

/// Local app database: saved connection profiles (no passwords) + query history.
/// We dogfood our own SQLite engine here.
pub struct Store {
    pool: sqlx::SqlitePool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub id: i64,
    pub connection_id: String,
    pub sql: String,
    pub ran_at: String,
}

impl Store {
    pub async fn open(db_path: &str) -> AppResult<Self> {
        let url = if db_path == ":memory:" {
            "sqlite::memory:".to_string()
        } else {
            format!("sqlite:{db_path}?mode=rwc")
        };
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect(&url)
            .await?;
        sqlx::query(
            "CREATE TABLE IF NOT EXISTS connections (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, engine TEXT NOT NULL,
                host TEXT, port INTEGER, database TEXT NOT NULL, username TEXT)",
        )
        .execute(&pool)
        .await?;
        sqlx::query(
            "CREATE TABLE IF NOT EXISTS query_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT, connection_id TEXT NOT NULL,
                sql TEXT NOT NULL, ran_at TEXT NOT NULL DEFAULT (datetime('now')))",
        )
        .execute(&pool)
        .await?;
        Ok(Self { pool })
    }

    pub async fn list_connections(&self) -> AppResult<Vec<ConnectionConfig>> {
        let rows = sqlx::query(
            "SELECT id,name,engine,host,port,database,username FROM connections ORDER BY name",
        )
        .fetch_all(&self.pool)
        .await?;
        let mut out = Vec::with_capacity(rows.len());
        for r in rows {
            out.push(ConnectionConfig {
                id: r.get("id"),
                name: r.get("name"),
                engine: r.get::<String, _>("engine").parse::<Engine>()?,
                host: r.get("host"),
                port: r.get::<Option<i64>, _>("port").map(|p| p as u16),
                database: r.get("database"),
                username: r.get("username"),
            });
        }
        Ok(out)
    }

    pub async fn upsert_connection(&self, cfg: &ConnectionConfig) -> AppResult<()> {
        let engine_str = match cfg.engine {
            Engine::Postgres => "postgres",
            Engine::MySql => "mysql",
            Engine::Sqlite => "sqlite",
        };
        sqlx::query(
            "INSERT INTO connections (id,name,engine,host,port,database,username)
             VALUES (?1,?2,?3,?4,?5,?6,?7)
             ON CONFLICT(id) DO UPDATE SET
                name=?2, engine=?3, host=?4, port=?5, database=?6, username=?7",
        )
        .bind(&cfg.id)
        .bind(&cfg.name)
        .bind(engine_str)
        .bind(&cfg.host)
        .bind(cfg.port.map(|p| p as i64))
        .bind(&cfg.database)
        .bind(&cfg.username)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn delete_connection(&self, id: &str) -> AppResult<()> {
        sqlx::query("DELETE FROM connections WHERE id=?1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn add_history(&self, connection_id: &str, sql: &str) -> AppResult<()> {
        sqlx::query("INSERT INTO query_history (connection_id, sql) VALUES (?1,?2)")
            .bind(connection_id)
            .bind(sql)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn recent_history(&self, limit: i64) -> AppResult<Vec<HistoryEntry>> {
        let rows = sqlx::query(
            "SELECT id,connection_id,sql,ran_at FROM query_history ORDER BY id DESC LIMIT ?1",
        )
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows
            .iter()
            .map(|r| HistoryEntry {
                id: r.get("id"),
                connection_id: r.get("connection_id"),
                sql: r.get("sql"),
                ran_at: r.get("ran_at"),
            })
            .collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::Engine;

    #[tokio::test]
    async fn roundtrips_connections_and_history() {
        let store = Store::open(":memory:").await.unwrap();
        let cfg = ConnectionConfig {
            id: "c1".into(),
            name: "local pg".into(),
            engine: Engine::Postgres,
            host: Some("localhost".into()),
            port: Some(5432),
            database: "app".into(),
            username: Some("me".into()),
        };
        store.upsert_connection(&cfg).await.unwrap();
        let list = store.list_connections().await.unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, "local pg");
        assert_eq!(list[0].port, Some(5432));

        store.add_history("c1", "SELECT 1").await.unwrap();
        store.add_history("c1", "SELECT 2").await.unwrap();
        let h = store.recent_history(10).await.unwrap();
        assert_eq!(h.len(), 2);
        assert_eq!(h[0].sql, "SELECT 2"); // newest first

        store.delete_connection("c1").await.unwrap();
        assert!(store.list_connections().await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn opens_file_backed_store_at_real_path() {
        // Mirrors what setup() does at launch: open a file DB at an OS path
        // (Windows path with backslashes + drive colon).
        let dir = std::env::temp_dir().join(format!("mamasql_store_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        let db = dir.join("app.db");
        let path = db.to_str().unwrap();

        let store = Store::open(path).await.unwrap();
        let cfg = ConnectionConfig {
            id: "f1".into(),
            name: "file".into(),
            engine: Engine::Sqlite,
            host: None,
            port: None,
            database: ":memory:".into(),
            username: None,
        };
        store.upsert_connection(&cfg).await.unwrap();
        assert_eq!(store.list_connections().await.unwrap().len(), 1);

        // Reopen the same file: data persists.
        drop(store);
        let store2 = Store::open(path).await.unwrap();
        assert_eq!(store2.list_connections().await.unwrap().len(), 1);
        drop(store2);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
