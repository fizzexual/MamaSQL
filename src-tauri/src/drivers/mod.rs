pub mod postgres;
pub mod sqlite;

use crate::error::AppResult;
use crate::types::{ColumnInfo, QueryResult, TableInfo};
use async_trait::async_trait;

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
}
