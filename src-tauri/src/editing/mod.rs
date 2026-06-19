//! Builds PK-safe DML for inline table editing. Identifiers are engine-quoted;
//! values become escaped SQL literals (the database coerces them to the column
//! type). This keeps a stray quote or backtick in a cell from breaking — or
//! injecting into — the statement.

use crate::types::{ColumnDef, Engine};
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

pub fn build_drop_table(engine: Engine, table: &str) -> String {
    format!("DROP TABLE {}", quote_ident(engine, table))
}

pub fn build_create_table(engine: Engine, table: &str, columns: &[ColumnDef]) -> String {
    let cols = columns
        .iter()
        .map(|c| {
            let mut s = format!("{} {}", quote_ident(engine, &c.name), c.data_type);
            if c.primary_key {
                s.push_str(" PRIMARY KEY");
            } else if !c.nullable {
                s.push_str(" NOT NULL");
            }
            s
        })
        .collect::<Vec<_>>()
        .join(", ");
    format!("CREATE TABLE {} ({})", quote_ident(engine, table), cols)
}

pub fn build_add_column(engine: Engine, table: &str, col: &ColumnDef) -> String {
    let mut s = format!(
        "ALTER TABLE {} ADD COLUMN {} {}",
        quote_ident(engine, table),
        quote_ident(engine, &col.name),
        col.data_type
    );
    if !col.nullable && !col.primary_key {
        s.push_str(" NOT NULL");
    }
    s
}

pub fn build_drop_column(engine: Engine, table: &str, column: &str) -> String {
    format!(
        "ALTER TABLE {} DROP COLUMN {}",
        quote_ident(engine, table),
        quote_ident(engine, column)
    )
}

pub fn build_rename_column(engine: Engine, table: &str, from: &str, to: &str) -> String {
    format!(
        "ALTER TABLE {} RENAME COLUMN {} TO {}",
        quote_ident(engine, table),
        quote_ident(engine, from),
        quote_ident(engine, to)
    )
}

pub fn build_rename_table(engine: Engine, from: &str, to: &str) -> String {
    format!(
        "ALTER TABLE {} RENAME TO {}",
        quote_ident(engine, from),
        quote_ident(engine, to)
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
    fn drop_and_create_table() {
        assert_eq!(build_drop_table(Engine::Postgres, "t"), r#"DROP TABLE "t""#);
        let cols = vec![
            ColumnDef { name: "id".into(), data_type: "SERIAL".into(), nullable: false, primary_key: true },
            ColumnDef { name: "name".into(), data_type: "TEXT".into(), nullable: false, primary_key: false },
            ColumnDef { name: "note".into(), data_type: "TEXT".into(), nullable: true, primary_key: false },
        ];
        assert_eq!(
            build_create_table(Engine::Postgres, "t", &cols),
            r#"CREATE TABLE "t" ("id" SERIAL PRIMARY KEY, "name" TEXT NOT NULL, "note" TEXT)"#
        );
    }

    #[test]
    fn alter_builders() {
        assert_eq!(
            build_rename_column(Engine::Postgres, "t", "a", "b"),
            r#"ALTER TABLE "t" RENAME COLUMN "a" TO "b""#
        );
        assert_eq!(
            build_drop_column(Engine::MySql, "t", "c"),
            "ALTER TABLE `t` DROP COLUMN `c`"
        );
        assert_eq!(
            build_rename_table(Engine::Postgres, "old", "new"),
            r#"ALTER TABLE "old" RENAME TO "new""#
        );
        let col = ColumnDef { name: "note".into(), data_type: "TEXT".into(), nullable: true, primary_key: false };
        assert_eq!(
            build_add_column(Engine::Sqlite, "t", &col),
            r#"ALTER TABLE "t" ADD COLUMN "note" TEXT"#
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
