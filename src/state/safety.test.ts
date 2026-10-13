import { describe, expect, it } from "vitest";
import { destructiveKind, isWrite } from "./safety";

describe("isWrite (read-only mode, production confirm)", () => {
  it.each([
    ["-- note\nDELETE FROM t WHERE id = 1", "a leading line comment"],
    ["/* note */ DROP TABLE t", "a leading block comment"],
    ["SELECT 1; DROP TABLE t", "a write after a read in the same script"],
    ["WITH x AS (SELECT 1) DELETE FROM t WHERE id IN (SELECT * FROM x)", "a WITH ... DELETE"],
    ["WITH d AS (DELETE FROM t RETURNING *) SELECT * FROM d", "a write inside a CTE"],
    ["EXPLAIN ANALYZE DELETE FROM t", "EXPLAIN ANALYZE, which runs the statement"],
    ["SELECT * INTO new_t FROM t", "SELECT ... INTO (creates a table)"],
    ["COPY t FROM '/tmp/x.csv'", "COPY"],
    ["CALL refresh_all()", "CALL"],
    ["VACUUM", "VACUUM"],
    ["PRAGMA foreign_keys = OFF", "a PRAGMA that sets something"],
    ["insert into t values (1)", "lower case"],
  ])("counts %j as a write (%s)", (sql) => {
    expect(isWrite(sql)).toBe(true);
  });

  it.each([
    "SELECT 1",
    "select * from t where note = 'drop table t'",
    'SELECT "delete" FROM t',
    "SELECT $$ DROP TABLE t $$",
    "-- DROP TABLE t\nSELECT 1",
    "EXPLAIN SELECT * FROM t",
    "SHOW TABLES",
    "PRAGMA table_info(t)",
    "WITH x AS (SELECT 1) SELECT * FROM x",
    "BEGIN; SELECT 1; COMMIT;",
  ])("counts %j as read-only", (sql) => {
    expect(isWrite(sql)).toBe(false);
  });
});

describe("destructiveKind (the DROP / no-WHERE confirm)", () => {
  it.each([
    ["DROP TABLE t", "drop"],
    ["-- x\nDROP TABLE t", "drop"],
    ["/* x */ truncate t", "drop"],
    ["SELECT 1; TRUNCATE t", "drop"],
    ["DELETE FROM t", "nowhere"],
    ["update t set n = 1", "nowhere"],
    ["UPDATE t SET n = 'where'", "nowhere"],
    ["UPDATE t SET n = 1 -- where id = 2", "nowhere"],
    ["WITH x AS (SELECT 1) DELETE FROM t", "nowhere"],
    ["DELETE FROM t WHERE id = 1; DELETE FROM u", "nowhere"],
  ])("flags %j as %s", (sql, kind) => {
    expect(destructiveKind(sql)).toBe(kind);
  });

  it.each([
    "DELETE FROM t WHERE id = 1",
    "DELETE FROM t WHERE id = $1",
    "UPDATE t SET n = 1 WHERE id = ?",
    "SELECT 'DROP TABLE t'",
    "SELECT $tag$ DELETE FROM t $tag$",
    "SELECT 1",
  ])("lets %j through", (sql) => {
    expect(destructiveKind(sql)).toBeNull();
  });
});
