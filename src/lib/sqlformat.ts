// Compact, dependency-free SQL pretty-printer. Heuristic and token-based — it
// handles the common SELECT / INSERT / UPDATE / DELETE shapes (clauses on their
// own lines, one select-item/condition per line, indented subqueries) rather
// than being a full grammar. Keywords are upper-cased; everything else is left
// as written.

const KEYWORDS = new Set(
  (
    "SELECT FROM WHERE AND OR NOT NULL IS IN LIKE ILIKE BETWEEN EXISTS DISTINCT AS ON USING " +
    "GROUP ORDER BY HAVING LIMIT OFFSET INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE VIEW " +
    "INDEX DROP ALTER ADD COLUMN RENAME TO JOIN LEFT RIGHT INNER OUTER FULL CROSS UNION INTERSECT " +
    "EXCEPT ALL ANY CASE WHEN THEN ELSE END WITH RETURNING COALESCE CAST PRIMARY KEY FOREIGN " +
    "REFERENCES UNIQUE DEFAULT CHECK CONSTRAINT ASC DESC"
  ).split(" "),
);

// Clauses that begin a fresh line at the current depth.
const NL_BEFORE = new Set([
  "SELECT", "FROM", "WHERE", "GROUP", "ORDER", "HAVING", "LIMIT", "OFFSET", "UNION", "INTERSECT",
  "EXCEPT", "VALUES", "SET", "RETURNING", "JOIN", "LEFT", "RIGHT", "INNER", "FULL", "CROSS", "ON",
]);
const JOIN_PREFIX = new Set(["LEFT", "RIGHT", "INNER", "OUTER", "FULL", "CROSS"]);

type TokType = "kw" | "word" | "str" | "com" | "num" | "op";
interface Tok {
  type: TokType;
  v: string;
}

function tokenize(sql: string): Tok[] {
  const re =
    /(--[^\n]*|\/\*[\s\S]*?\*\/)|('(?:[^']|'')*')|(\d+(?:\.\d+)?)|([A-Za-z_]\w*)|(\s+)|(::|<=|>=|<>|!=|\|\||[(),;.*]|[-+/<>=%])/g;
  const toks: Tok[] = [];
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard tokenizer loop
  while ((m = re.exec(sql)) !== null) {
    if (m[1]) toks.push({ type: "com", v: m[1] });
    else if (m[2]) toks.push({ type: "str", v: m[2] });
    else if (m[3]) toks.push({ type: "num", v: m[3] });
    else if (m[4]) toks.push({ type: KEYWORDS.has(m[4].toUpperCase()) ? "kw" : "word", v: m[4] });
    else if (m[5]) {
      /* whitespace — dropped, re-inserted by the layout rules */
    } else if (m[6]) toks.push({ type: "op", v: m[6] });
  }
  return toks;
}

export function formatSql(sql: string): string {
  const toks = tokenize(sql);
  if (toks.length === 0) return sql.trim();

  const lines: string[] = [];
  let cur = "";
  let curIndent = 0;
  let depth = 0; // subquery paren nesting → base indent
  const parenSub: boolean[] = [];

  const push = (v: string, space = true) => {
    cur = cur === "" ? v : cur + (space ? " " : "") + v;
  };
  const breakLine = (indentForNext: number) => {
    if (cur.trim() !== "") lines.push("  ".repeat(curIndent) + cur.trim());
    cur = "";
    curIndent = indentForNext;
  };

  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    const up = t.v.toUpperCase();
    const prev = toks[i - 1];
    const next = toks[i + 1];
    const lastChar = cur.slice(-1);

    if (t.type === "com") {
      push(t.v);
      continue;
    }
    if (t.type === "op" && t.v === ";") {
      cur += ";";
      breakLine(0);
      lines.push("");
      depth = 0;
      parenSub.length = 0;
      continue;
    }
    if (t.type === "op" && t.v === "(") {
      const sub = !!next && next.type === "kw" && next.v.toUpperCase() === "SELECT";
      parenSub.push(sub);
      const isCall = !!prev && (prev.type === "word" || prev.type === "kw") && !NL_BEFORE.has(prev.v.toUpperCase());
      push("(", !isCall);
      if (sub) {
        depth++;
        breakLine(depth);
      }
      continue;
    }
    if (t.type === "op" && t.v === ")") {
      if (parenSub.pop()) {
        depth = Math.max(0, depth - 1);
        breakLine(depth);
      }
      push(")", false);
      continue;
    }
    if (t.type === "op" && t.v === ",") {
      push(",", false);
      breakLine(depth + 1);
      continue;
    }
    if (t.type === "op") {
      if (t.v === "." || t.v === "::") cur += t.v;
      else push(t.v, !(cur === "" || lastChar === "("));
      continue;
    }
    if (t.type === "kw" && NL_BEFORE.has(up)) {
      const contJoin = up === "JOIN" && !!prev && JOIN_PREFIX.has(prev.v.toUpperCase());
      if (!contJoin) breakLine(depth);
      push(up, cur !== "");
      continue;
    }
    if (t.type === "kw" && (up === "AND" || up === "OR")) {
      breakLine(depth + 1);
      push(up);
      continue;
    }

    const v = t.type === "kw" ? up : t.v;
    push(v, !(cur === "" || lastChar === "." || lastChar === "("));
  }
  breakLine(0);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
