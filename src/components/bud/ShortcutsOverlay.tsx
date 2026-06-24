import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { backdropV, listItemV, listV, panelV } from "../../lib/motion";

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["⌘", "K"], label: "Command palette" },
  { keys: ["⌘", "↵"], label: "Execute query (or selection)" },
  { keys: ["⌘", "/"], label: "Toggle line comment" },
  { keys: ["⌘", "⇧", "F"], label: "Format SQL" },
  { keys: ["⌘", "D"], label: "Duplicate line / selection" },
  { keys: ["Alt", "↑", "↓"], label: "Move line up / down" },
  { keys: ["Tab", "⇧Tab"], label: "Indent / outdent" },
  { keys: ["(", "[", "\"", "…"], label: "Wrap selection in brackets / quotes" },
  { keys: ["Alt", "1-9"], label: "Switch editor tab" },
  { keys: ["⌘", "Space"], label: "Trigger autocomplete" },
  { keys: ["↑", "↓"], label: "Navigate suggestions / palette" },
  { keys: ["Ctrl", "C"], label: "Copy selected cell (data grid)" },
  { keys: ["Esc"], label: "Close popups & menus" },
  { keys: ["?"], label: "Show this help" },
  { keys: ["Right-click"], label: "Context menu on tree / tables" },
  { keys: ["Click / Dbl-click"], label: "Select cell / edit cell (data grid)" },
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

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="bud-sc-backdrop"
          variants={backdropV}
          initial="hidden"
          animate="show"
          exit="exit"
          onClick={() => setOpen(false)}
        >
          <motion.div
            className="bud-sc"
            variants={panelV}
            initial="hidden"
            animate="show"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bud-sc-head">Keyboard shortcuts</div>
            <motion.div className="bud-sc-list" variants={listV} initial="hidden" animate="show">
              {SHORTCUTS.map((s) => (
                <motion.div className="bud-sc-row" key={s.label} variants={listItemV}>
                  <span className="bud-sc-label">{s.label}</span>
                  <span className="bud-sc-keys">
                    {s.keys.map((k, i) => (
                      <kbd key={i}>{k}</kbd>
                    ))}
                  </span>
                </motion.div>
              ))}
            </motion.div>
            <div className="bud-sc-foot">
              Press <kbd>Esc</kbd> to close
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
