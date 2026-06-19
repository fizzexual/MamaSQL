use serde::ser::SerializeMap;
use serde::{Serialize, Serializer};

pub type AppResult<T> = Result<T, AppError>;

/// Application-wide error type. Tuple variants keep construction ergonomic
/// (`AppError::Internal("...".into())`); the manual `Serialize` impl flattens
/// every variant to `{ kind, message?, position? }` for the TypeScript side.
#[derive(Debug, thiserror::Error)]
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

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut map = serializer.serialize_map(None)?;
        match self {
            AppError::ConnectionFailed(m) => {
                map.serialize_entry("kind", "connectionFailed")?;
                map.serialize_entry("message", m)?;
            }
            AppError::AuthFailed(m) => {
                map.serialize_entry("kind", "authFailed")?;
                map.serialize_entry("message", m)?;
            }
            AppError::QueryError { message, position } => {
                map.serialize_entry("kind", "queryError")?;
                map.serialize_entry("message", message)?;
                map.serialize_entry("position", position)?;
            }
            AppError::Timeout => {
                map.serialize_entry("kind", "timeout")?;
            }
            AppError::Canceled => {
                map.serialize_entry("kind", "canceled")?;
            }
            AppError::NotFound(m) => {
                map.serialize_entry("kind", "notFound")?;
                map.serialize_entry("message", m)?;
            }
            AppError::Internal(m) => {
                map.serialize_entry("kind", "internal")?;
                map.serialize_entry("message", m)?;
            }
        }
        map.end()
    }
}

impl From<sqlx::Error> for AppError {
    fn from(e: sqlx::Error) -> Self {
        match e {
            sqlx::Error::RowNotFound => AppError::NotFound("row not found".into()),
            sqlx::Error::Database(db) => AppError::QueryError {
                message: db.message().to_string(),
                position: None,
            },
            sqlx::Error::PoolTimedOut => AppError::Timeout,
            other => AppError::ConnectionFailed(other.to_string()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_query_error_as_camelcase_tagged() {
        let e = AppError::QueryError {
            message: "boom".into(),
            position: Some(12),
        };
        let v = serde_json::to_value(&e).unwrap();
        assert_eq!(v["kind"], "queryError");
        assert_eq!(v["message"], "boom");
        assert_eq!(v["position"], 12);
    }

    #[test]
    fn serializes_unit_variant_with_only_kind() {
        let v = serde_json::to_value(AppError::Timeout).unwrap();
        assert_eq!(v["kind"], "timeout");
        assert!(v.get("message").is_none());
    }

    #[test]
    fn maps_sqlx_rownotfound_to_notfound() {
        let app: AppError = sqlx::Error::RowNotFound.into();
        assert!(matches!(app, AppError::NotFound(_)));
    }
}
