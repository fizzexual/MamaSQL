use crate::error::{AppError, AppResult};
use sqlx::{Row, TypeInfo, ValueRef};

/// Convert one SQLite row into JSON values, mapping by the value's storage
/// type. NULLs become `Value::Null`; BLOBs become a `\x..` hex string.
pub fn sqlite_row_to_values(row: &sqlx::sqlite::SqliteRow) -> AppResult<Vec<serde_json::Value>> {
    let mut out = Vec::with_capacity(row.len());
    for i in 0..row.len() {
        let raw = row
            .try_get_raw(i)
            .map_err(|e| AppError::Internal(e.to_string()))?;
        if raw.is_null() {
            out.push(serde_json::Value::Null);
            continue;
        }
        let type_name = raw.type_info().name().to_uppercase();
        let value = match type_name.as_str() {
            "INTEGER" | "BIGINT" | "INT" => row.try_get::<i64, _>(i).map(|x| serde_json::json!(x)),
            "REAL" | "FLOAT" | "DOUBLE" => row.try_get::<f64, _>(i).map(|x| serde_json::json!(x)),
            "BOOLEAN" => row.try_get::<bool, _>(i).map(|x| serde_json::json!(x)),
            "BLOB" => row
                .try_get::<Vec<u8>, _>(i)
                .map(|b| serde_json::json!(format!("\\x{}", to_hex(&b)))),
            _ => row.try_get::<String, _>(i).map(|x| serde_json::json!(x)),
        }
        .unwrap_or(serde_json::Value::Null);
        out.push(value);
    }
    Ok(out)
}

fn to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use crate::drivers::{sqlite::SqliteDriver, Driver};
    use crate::types::{ConnectionConfig, Engine};

    async fn seeded() -> SqliteDriver {
        let cfg = ConnectionConfig {
            id: "t".into(),
            name: "m".into(),
            engine: Engine::Sqlite,
            host: None,
            port: None,
            database: ":memory:".into(),
            username: None,
        };
        let d = SqliteDriver::connect(&cfg).await.unwrap();
        d.execute("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT, score REAL, flag BOOLEAN)")
            .await
            .unwrap();
        d.execute("INSERT INTO t (name, score, flag) VALUES ('a', 1.5, 1), ('b', NULL, 0)")
            .await
            .unwrap();
        d
    }

    #[tokio::test]
    async fn select_returns_columns_and_typed_rows() {
        let d = seeded().await;
        let r = d
            .execute("SELECT id, name, score FROM t ORDER BY id")
            .await
            .unwrap();
        assert_eq!(
            r.columns.iter().map(|c| c.name.as_str()).collect::<Vec<_>>(),
            vec!["id", "name", "score"]
        );
        assert_eq!(r.rows.len(), 2);
        assert_eq!(r.rows[0][1], serde_json::json!("a"));
        assert_eq!(r.rows[1][2], serde_json::Value::Null);
        assert!(!r.truncated);
    }
}
