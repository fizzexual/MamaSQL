use crate::error::{AppError, AppResult};
use keyring::Entry;

const SERVICE: &str = "MamaSQL";

fn entry(connection_id: &str) -> AppResult<Entry> {
    Entry::new(SERVICE, connection_id).map_err(|e| AppError::Internal(e.to_string()))
}

/// Store a connection's password in the OS keychain (Windows Credential
/// Manager), keyed by connection id.
pub fn set_password(connection_id: &str, password: &str) -> AppResult<()> {
    entry(connection_id)?
        .set_password(password)
        .map_err(|e| AppError::Internal(e.to_string()))
}

/// Read a password back. Returns `Ok(None)` if no entry exists.
pub fn get_password(connection_id: &str) -> AppResult<Option<String>> {
    match entry(connection_id)?.get_password() {
        Ok(p) => Ok(Some(p)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(AppError::Internal(e.to_string())),
    }
}

/// Delete a password. A missing entry is treated as success.
pub fn delete_password(connection_id: &str) -> AppResult<()> {
    match entry(connection_id)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(AppError::Internal(e.to_string())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore = "requires an OS keychain; run locally with: cargo test secrets -- --ignored"]
    fn set_get_delete_roundtrip() {
        let id = "mamasql-test-conn-xyz";
        set_password(id, "s3cret").unwrap();
        assert_eq!(get_password(id).unwrap().as_deref(), Some("s3cret"));
        delete_password(id).unwrap();
        assert_eq!(get_password(id).unwrap(), None);
    }
}
