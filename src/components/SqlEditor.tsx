import type { KeyboardEvent } from "react";
import { useStore } from "../state/store";

// M1: a plain textarea editor. Task 6 upgrades this to CodeMirror 6 with
// SQL highlighting + schema-aware autocomplete, behind the same store binding.
export function SqlEditor() {
  const sql = useStore((s) => s.sql);
  const setSql = useStore((s) => s.setSql);
  const run = useStore((s) => s.run);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      run();
    }
  };

  return (
    <div className="editor">
      <div className="editor-tabbar">
        <span className="tab active">Query 1</span>
      </div>
      <textarea
        className="editor-area"
        value={sql}
        spellCheck={false}
        onChange={(e) => setSql(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Write SQL — press Ctrl/Cmd+Enter to run"
      />
    </div>
  );
}
