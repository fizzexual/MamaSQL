pub mod mysql;
pub mod postgres;
pub mod sqlite;

use crate::error::{AppError, AppResult};
use crate::types::{ColumnInfo, QueryResult, TableInfo};
use async_trait::async_trait;
use serde_json::Value;

/// The seam every database engine plugs into. SQLite is implemented here;
/// Postgres and MySQL arrive in Plan 3 as additional impls of this trait.
#[async_trait]
pub trait Driver: Send + Sync {
    /// Run a statement. SELECT-like statements return columns + rows;
    /// others return `rows_affected`.
    async fn execute(&self, sql: &str) -> AppResult<QueryResult>;
    /// List tables and views.
    async fn list_tables(&self) -> AppResult<Vec<TableInfo>>;
    /// List columns of a table.
    async fn list_columns(&self, table: &str) -> AppResult<Vec<ColumnInfo>>;
    /// Run a statement with `?` placeholders bound to `params`; returns rows affected.
    /// Used where values can't safely be written into the SQL (MySQL edits).
    async fn execute_bound(&self, _sql: &str, _params: &[Value]) -> AppResult<u64> {
        Err(AppError::Internal("bound parameters are not supported by this engine".into()))
    }
}
