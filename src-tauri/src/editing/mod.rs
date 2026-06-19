//! Builds PK-safe DML for inline table editing. Identifiers are engine-quoted;
//! values become escaped SQL literals (the database coerces them to the column
//! type). This keeps a stray quote or backtick in a cell from breaking — or
//! injecting into — the statement.

use crate::types::Engine;
use serde_json::Value;

fn quote_ident(engine: Engine, name: &str) -> String {
    match engine {
        Engine::MySql => format!("`{}`", name.replace('`', "``")),
        _ => format!("\"{}\"", name.replace('"', "\"\"")),
    }
}

fn literal(v: &Value) -> String {
    match v {
        Value::Null => "NULL".to_string(),
        Value::Bool(true) => "TRUE".to_string(),
        Value::Bool(false) => "FALSE".to_string(),
        Value::String(s) => format!("'{}'", s.replace('\'', "''")),
        // Numbers (and anything else) become a quoted literal; the DB coerces
        // '7' -> 7 for an integer column, etc.
        other => format!("'{}'", other.to_string().replace('\'', "''")),
    }
}

pub fn build_update(
    engine: Engine,
    table: &str,
    set_column: &str,
    set_value: &Value,
    pk_column: &str,
    pk_value: &Value,
) -> String {
    format!(
        "UPDATE {} SET {} = {} WHERE {} = {}",
        quote_ident(engine, table),
        quote_ident(engine, set_column),
        literal(set_value),
        quote_ident(engine, pk_column),
        literal(pk_value),
    )
}

pub fn build_delete(engine: Engine, table: &str, pk_column: &str, pk_value: &Value) -> String {
    format!(
        "DELETE FROM {} WHERE {} = {}",
        quote_ident(engine, table),
        quote_ident(engine, pk_column),
        literal(pk_value),
    )
}

pub fn build_insert(engine: Engine, table: &str, columns: &[String], values: &[Value]) -> String {
    let cols = columns
        .iter()
        .map(|c| quote_ident(engine, c))
        .collect::<Vec<_>>()
        .join(", ");
    let vals = values.iter().map(literal).collect::<Vec<_>>().join(", ");
    format!(
        "INSERT INTO {} ({}) VALUES ({})",
        quote_ident(engine, table),
        cols,
        vals,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn update_escapes_values_and_quotes_idents_pg() {
        let sql = build_update(Engine::Postgres, "users", "name", &json!("O'Brien"), "id", &json!(7));
        assert_eq!(sql, r#"UPDATE "users" SET "name" = 'O''Brien' WHERE "id" = '7'"#);
    }

    #[test]
    fn update_uses_backticks_for_mysql() {
        let sql = build_update(Engine::MySql, "t", "c", &json!("x"), "id", &json!(1));
        assert_eq!(sql, "UPDATE `t` SET `c` = 'x' WHERE `id` = '1'");
    }

    #[test]
    fn quotes_in_identifiers_are_doubled() {
        // a column literally named  weird"col  must not break out of the quoting
        let sql = build_update(Engine::Postgres, "t", "weird\"col", &json!("v"), "id", &json!(1));
        assert_eq!(sql, r#"UPDATE "t" SET "weird""col" = 'v' WHERE "id" = '1'"#);
    }

    #[test]
    fn null_and_bool_literals() {
        assert_eq!(
            build_update(Engine::Sqlite, "t", "c", &json!(null), "id", &json!(1)),
            r#"UPDATE "t" SET "c" = NULL WHERE "id" = '1'"#
        );
        assert_eq!(
            build_update(Engine::Sqlite, "t", "c", &json!(true), "id", &json!(1)),
            r#"UPDATE "t" SET "c" = TRUE WHERE "id" = '1'"#
        );
    }

    #[test]
    fn delete_and_insert() {
        assert_eq!(
            build_delete(Engine::Postgres, "t", "id", &json!(3)),
            r#"DELETE FROM "t" WHERE "id" = '3'"#
        );
        assert_eq!(
            build_insert(
                Engine::Postgres,
                "t",
                &["a".into(), "b".into()],
                &[json!("x"), json!(2)]
            ),
            r#"INSERT INTO "t" ("a", "b") VALUES ('x', '2')"#
        );
    }
}
