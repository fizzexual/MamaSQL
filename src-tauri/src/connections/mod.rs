use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::drivers::{sqlite::SqliteDriver, Driver};
use crate::error::{AppError, AppResult};
use crate::types::{ConnectionConfig, Engine};

/// Holds live, open drivers keyed by connection id. Shared via Tauri state.
pub struct ConnectionRegistry {
    live: RwLock<HashMap<String, Arc<dyn Driver>>>,
}

impl ConnectionRegistry {
    pub fn new() -> Self {
        Self {
            live: RwLock::new(HashMap::new()),
        }
    }

    /// Open a connection for `cfg` and register it under `cfg.id`. v1 supports
    /// SQLite; Postgres/MySQL land in Plan 3 (same trait).
    pub async fn open(&self, cfg: &ConnectionConfig, password: Option<&str>) -> AppResult<()> {
        let driver: Arc<dyn Driver> = match cfg.engine {
            Engine::Sqlite => Arc::new(SqliteDriver::connect(cfg).await?),
            Engine::Postgres => {
                Arc::new(crate::drivers::postgres::PgDriver::connect(cfg, password).await?)
            }
            Engine::MySql => {
                return Err(AppError::Internal(
                    "MySQL/MariaDB coming in Plan 3 (in progress)".into(),
                ))
            }
        };
        self.live.write().await.insert(cfg.id.clone(), driver);
        Ok(())
    }

    pub async fn get(&self, id: &str) -> AppResult<Arc<dyn Driver>> {
        self.live
            .read()
            .await
            .get(id)
            .cloned()
            .ok_or_else(|| AppError::NotFound(format!("connection not open: {id}")))
    }

    pub async fn close(&self, id: &str) {
        self.live.write().await.remove(id);
    }
}

impl Default for ConnectionRegistry {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg() -> ConnectionConfig {
        ConnectionConfig {
            id: "c1".into(),
            name: "m".into(),
            engine: Engine::Sqlite,
            host: None,
            port: None,
            database: ":memory:".into(),
            username: None,
        }
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
