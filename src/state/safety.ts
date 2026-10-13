import { confirmDialog } from "./dialog";

/**
 * Split a script into statements, with comments removed and the contents of
 * strings, quoted identifiers and dollar-quoted bodies blanked out — so a
 * keyword inside them ("drop", "where") can't fool the checks below. Lower-cased.
 *
 * Backslash is not treated as an escape: on MySQL that can make a string look
 * shorter than it is, which only ever makes the checks stricter, never looser.
 */
export function statements(sql: string): string[] {
  const out: string[] = [];
  let cur = "";
  let i = 0;
  const n = sql.length;
  const closeQuote = (q: string) => {
    // Skip to the closing quote; a doubled quote is an escaped one.
    i++;
    while (i < n) {
      if (sql[i] === q) {
        if (sql[i + 1] === q) i += 2;
        else break;
      } else i++;
    }
    i++;
  };
  while (i < n) {
    const c = sql[i];
    if (c === "-" && sql[i + 1] === "-") {
      while (i < n && sql[i] !== "\n") i++;
      cur += " ";
    } else if (c === "/" && sql[i + 1] === "*") {
      const end = sql.indexOf("*/", i + 2);
      i = end < 0 ? n : end + 2;
      cur += " ";
    } else if (c === "'" || c === '"' || c === "`") {
      closeQuote(c);
      cur += ` ${c}${c} `;
    } else if (c === "$" && /^\$[A-Za-z_]?\w*\$/.test(sql.slice(i)) && !/^\$\d/.test(sql.slice(i))) {
      const tag = /^\$[A-Za-z_]?\w*\$/.exec(sql.slice(i))![0];
      const end = sql.indexOf(tag, i + tag.length);
      i = end < 0 ? n : end + tag.length;
      cur += " $$ ";
    } else if (c === ";") {
      if (cur.trim()) out.push(cur.trim().toLowerCase());
      cur = "";
      i++;
    } else {
      cur += c;
      i++;
    }
  }
  if (cur.trim()) out.push(cur.trim().toLowerCase());
  return out;
}

const firstWord = (stmt: string) => /^[a-z]+/.exec(stmt)?.[0] ?? "";
const WRITE_VERB = /\b(insert|update|delete|merge|upsert|replace)\b/;

// Statements that only read (or only manage the session's transaction).
// Anything not listed counts as a write — new or unusual commands are guarded
// by default instead of slipping through.
const READ_ONLY = new Set([
  "select", "show", "describe", "desc", "explain", "values", "table", "with", "pragma",
  "begin", "start", "commit", "end", "rollback", "savepoint", "release", "use",
]);

function stmtIsWrite(stmt: string): boolean {
  const verb = firstWord(stmt);
  if (!READ_ONLY.has(verb)) return true;
  if (verb === "select") return /\binto\b/.test(stmt); // SELECT ... INTO creates a table / file
  if (verb === "with") return WRITE_VERB.test(stmt) || /\binto\b/.test(stmt);
  if (verb === "explain") return /\banalyze\b/.test(stmt) && WRITE_VERB.test(stmt); // ANALYZE runs it
  if (verb === "pragma") return stmt.includes("=");
  return false;
}

/** Does the script modify data, schema or settings (vs only reading)? */
export function isWrite(sql: string): boolean {
  return statements(sql).some(stmtIsWrite);
}

/**
 * Why the script needs a destructive confirm: "drop" (DROP/TRUNCATE), "nowhere"
 * (an UPDATE/DELETE with no WHERE, so it hits every row), or null.
 */
export function destructiveKind(sql: string): "drop" | "nowhere" | null {
  let kind: "drop" | "nowhere" | null = null;
  for (const stmt of statements(sql)) {
    const verb = firstWord(stmt);
    if (verb === "drop" || verb === "truncate") return "drop";
    // The UPDATE/DELETE itself, also when it follows a WITH clause.
    const dml = verb === "with" ? /\b(update|delete)\b[\s\S]*$/.exec(stmt)?.[0] : verb === "update" || verb === "delete" ? stmt : undefined;
    if (dml && !/\bwhere\b/.test(dml)) kind = "nowhere";
  }
  return kind;
}

/**
 * If the script is destructive (DROP/TRUNCATE, or DELETE/UPDATE with no
 * WHERE), ask for confirmation. Returns true when it's safe to proceed.
 */
export async function confirmIfDestructive(sql: string): Promise<boolean> {
  const kind = destructiveKind(sql);
  if (kind === "drop") {
    return confirmDialog({
      title: "Run destructive statement?",
      message: "This DROP/TRUNCATE permanently removes a table or all its rows. This can't be undone.",
      confirmLabel: "Run anyway",
      danger: true,
    });
  }
  if (kind === "nowhere") {
    return confirmDialog({
      title: "Run without a WHERE clause?",
      message: "This UPDATE/DELETE has no WHERE — it affects every row in the table. This can't be undone.",
      confirmLabel: "Run anyway",
      danger: true,
    });
  }
  return true;
}

/**
 * Extra guard for connections tagged `prod`: any write gets an explicit
 * "you're on production" confirm. Returns true when it's safe to proceed.
 */
export async function confirmProdWrite(
  conn: { name: string; env?: string | null } | undefined,
  sql: string,
): Promise<boolean> {
  if (!conn || conn.env !== "prod" || !isWrite(sql)) return true;
  return confirmDialog({
    title: "Write to PRODUCTION?",
    message: `“${conn.name}” is flagged as a production connection. This statement modifies data and can't be undone. Run it on production?`,
    confirmLabel: "Run on production",
    danger: true,
  });
}
