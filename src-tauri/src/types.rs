use crate::error::AppError;
use serde::{Deserialize, Serialize};
use std::str::FromStr;

/// Max rows retained from a buffered result set (memory guard). Larger results
/// set `QueryResult.truncated = true`.
pub const MAX_ROWS: usize = 50_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Engine {
    Postgres,
    MySql,
    Sqlite,
}

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

/// A saved connection profile. Note: NO password field — secrets live only in
/// the OS keychain, keyed by `id`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionConfig {
    pub id: String,
    pub name: String,
    pub engine: Engine,
    #[serde(default)]
    pub host: Option<String>,
    #[serde(default)]
    pub port: Option<u16>,
    pub database: String,
    #[serde(default)]
    pub username: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Column {
    pub name: String,
    pub data_type: String,
}

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
pub struct TableInfo {
    pub name: String,
    pub kind: String,
    pub schema: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ColumnInfo {
    pub name: String,
    pub data_type: String,
    pub nullable: bool,
    pub is_primary_key: bool,
}

/// A column definition for the visual create-table designer.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ColumnDef {
    pub name: String,
    pub data_type: String,
    pub nullable: bool,
    pub primary_key: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn engine_serializes_lowercase() {
        assert_eq!(
            serde_json::to_value(Engine::MySql).unwrap(),
            serde_json::json!("mysql")
        );
        assert_eq!("sqlite".parse::<Engine>().unwrap(), Engine::Sqlite);
        assert_eq!("MariaDB".parse::<Engine>().unwrap(), Engine::MySql);
    }

    #[test]
    fn connection_config_has_no_password_field() {
        let json = serde_json::json!({
            "id":"a","name":"local","engine":"sqlite","database":"/tmp/x.db"
        });
        let cfg: ConnectionConfig = serde_json::from_value(json).unwrap();
        assert_eq!(cfg.engine, Engine::Sqlite);
        assert!(cfg.host.is_none());
        assert_eq!(cfg.database, "/tmp/x.db");
    }
}
