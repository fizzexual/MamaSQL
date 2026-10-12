import { describe, expect, it } from "vitest";
import type { QueryResult } from "../ipc/types";
import { toMarkdown } from "./csv";

function result(rows: unknown[][]): QueryResult {
  return { columns: [{ name: "v", dataType: "" }], rows, rowsAffected: 0, elapsedMs: 1, truncated: false };
}
const bodyCell = (md: string) => md.split("\n")[2];

describe("toMarkdown", () => {
  it("escapes a pipe so it stays inside its cell", () => {
    expect(bodyCell(toMarkdown(result([["a|b"]])))).toBe("| a\\|b |");
  });

  it("escapes a backslash before a pipe, so the pipe can't end the cell", () => {
    // Cell text a\|b must come out as a\\\|b: an escaped backslash, then an escaped pipe.
    expect(bodyCell(toMarkdown(result([["a\\|b"]])))).toBe("| a\\\\\\|b |");
  });

  it("keeps a lone backslash as one visible backslash", () => {
    expect(bodyCell(toMarkdown(result([["C:\\temp"]])))).toBe("| C:\\\\temp |");
  });
});
