import { useEffect, useState } from "react";

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["⌘", "K"], label: "Command palette" },
  { keys: ["⌘", "↵"], label: "Execute query (or selection)" },
  { keys: ["Ctrl", "/"], label: "Toggle line comment" },
  { keys: ["⌘", "Space"], label: "Trigger autocomplete" },
  { keys: ["Tab"], label: "Accept suggestion" },
  { keys: ["↑", "↓"], label: "Navigate suggestions / palette" },
  { keys: ["Esc"], label: "Close popups & menus" },
  { keys: ["?"], label: "Show this help" },
  { keys: ["Right-click"], label: "Context menu on tree / tables" },
  { keys: ["Double-click"], label: "Edit a cell (data grid)" },
];

export function ShortcutsOverlay() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onEvt = () => setOpen(true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (e.key === "?" && !typing) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("mamasql:shortcuts", onEvt);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mamasql:shortcuts", onEvt);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  if (!open) return null;

  return (
    <div className="bud-sc-backdrop" onClick={() => setOpen(false)}>
      <div className="bud-sc" onClick={(e) => e.stopPropagation()}>
        <div className="bud-sc-head">Keyboard shortcuts</div>
        <div className="bud-sc-list">
          {SHORTCUTS.map((s) => (
            <div className="bud-sc-row" key={s.label}>
              <span className="bud-sc-label">{s.label}</span>
              <span className="bud-sc-keys">
                {s.keys.map((k, i) => (
                  <kbd key={i}>{k}</kbd>
                ))}
              </span>
            </div>
          ))}
        </div>
        <div className="bud-sc-foot">
          Press <kbd>Esc</kbd> to close
        </div>
      </div>
    </div>
  );
}
