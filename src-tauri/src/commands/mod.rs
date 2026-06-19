use crate::connections::ConnectionRegistry;
use crate::error::{AppError, AppResult};
use crate::schema;
use crate::secrets;
use crate::store::{HistoryEntry, Store};
use crate::types::{ColumnInfo, ConnectionConfig, QueryResult, TableInfo};
use tauri::State;

/// Shared application state, managed by Tauri and injected into commands.
pub struct AppState {
    pub registry: ConnectionRegistry,
    pub store: Store,
}

/// Split rows into fixed-size chunks for streamed emission (consumed by the
/// frontend grid in Plan 2). `size == 0` yields a single chunk.
pub fn chunk_rows(rows: &[Vec<serde_json::Value>], size: usize) -> Vec<&[Vec<serde_json::Value>]> {
    if size == 0 {
        return vec![rows];
    }
    rows.chunks(size).collect()
}

#[tauri::command]
pub async fn list_connections(state: State<'_, AppState>) -> AppResult<Vec<ConnectionConfig>> {
    state.store.list_connections().await
}

#[tauri::command]
pub async fn save_connection(
    state: State<'_, AppState>,
    cfg: ConnectionConfig,
    password: Option<String>,
) -> AppResult<()> {
    state.store.upsert_connection(&cfg).await?;
    if let Some(pw) = password {
        secrets::set_password(&cfg.id, &pw)?;
    }
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
        _ => {
            let _ = password;
            Err(AppError::Internal("engine not yet supported (Plan 3)".into()))
        }
    }
}

#[tauri::command]
pub async fn open_connection(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let conns = state.store.list_connections().await?;
    let cfg = conns
        .into_iter()
        .find(|c| c.id == id)
        .ok_or_else(|| AppError::NotFound(format!("no saved connection: {id}")))?;
    let pw = secrets::get_password(&id)?;
    state.registry.open(&cfg, pw.as_deref()).await
}

#[tauri::command]
pub async fn close_connection(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.registry.close(&id).await;
    Ok(())
}

#[tauri::command]
pub async fn run_query(
    state: State<'_, AppState>,
    connection_id: String,
    sql: String,
) -> AppResult<QueryResult> {
    let driver = state.registry.get(&connection_id).await?;
    let result = driver.execute(&sql).await?;
    // History failure must never fail the query itself.
    let _ = state.store.add_history(&connection_id, &sql).await;
    Ok(result)
}

#[tauri::command]
pub async fn list_tables(
    state: State<'_, AppState>,
    connection_id: String,
) -> AppResult<Vec<TableInfo>> {
    let driver = state.registry.get(&connection_id).await?;
    schema::introspect_tables(driver.as_ref()).await
}

#[tauri::command]
pub async fn list_columns(
    state: State<'_, AppState>,
    connection_id: String,
    table: String,
) -> AppResult<Vec<ColumnInfo>> {
    let driver = state.registry.get(&connection_id).await?;
    schema::introspect_columns(driver.as_ref(), &table).await
}

#[tauri::command]
pub async fn recent_history(
    state: State<'_, AppState>,
    limit: i64,
) -> AppResult<Vec<HistoryEntry>> {
    state.store.recent_history(limit).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chunks_rows_evenly_with_remainder() {
        let rows: Vec<Vec<serde_json::Value>> =
            (0..5).map(|i| vec![serde_json::json!(i)]).collect();
        let chunks = chunk_rows(&rows, 2);
        assert_eq!(chunks.len(), 3);
        assert_eq!(chunks[0].len(), 2);
        assert_eq!(chunks[2].len(), 1);
    }

    #[test]
    fn chunk_size_zero_yields_single_chunk() {
        let rows: Vec<Vec<serde_json::Value>> = vec![vec![serde_json::json!(1)]];
        assert_eq!(chunk_rows(&rows, 0).len(), 1);
    }
}
