import { confirmDialog } from "./dialog";

const WRITE_RE = /^\s*(insert|update|delete|drop|alter|truncate|create|replace|merge|grant|revoke)\b/i;
const DESTRUCTIVE_RE = /^\s*(drop|truncate)\b/i;
// DELETE/UPDATE that has no WHERE clause anywhere in the statement.
const NOWHERE_RE = /^\s*(delete|update)\b(?![\s\S]*\bwhere\b)/i;

/** Does the statement modify data/schema (vs a read-only SELECT/EXPLAIN)? */
export function isWrite(sql: string): boolean {
  return WRITE_RE.test(sql);
}

/**
 * If the statement is destructive (DROP/TRUNCATE, or DELETE/UPDATE with no
 * WHERE), ask for confirmation. Returns true when it's safe to proceed.
 */
export async function confirmIfDestructive(sql: string): Promise<boolean> {
  const s = sql.trim();
  if (DESTRUCTIVE_RE.test(s)) {
    return confirmDialog({
      title: "Run destructive statement?",
      message: "This DROP/TRUNCATE permanently removes a table or all its rows. This can't be undone.",
      confirmLabel: "Run anyway",
      danger: true,
    });
  }
  if (NOWHERE_RE.test(s)) {
    return confirmDialog({
      title: "Run without a WHERE clause?",
      message: "This UPDATE/DELETE has no WHERE — it affects every row in the table. This can't be undone.",
      confirmLabel: "Run anyway",
      danger: true,
    });
  }
  return true;
}
