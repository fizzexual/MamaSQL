import { useEffect, useState } from "react";
import { useDialog } from "../../state/dialog";

/** Renders the active themed dialog (confirm / prompt). Mount once at the app root. */
export function DialogHost() {
  const current = useDialog((s) => s.current);
  const close = useDialog((s) => s.close);
  const [value, setValue] = useState("");

  useEffect(() => {
    setValue(current?.defaultValue ?? "");
  }, [current]);

  // Keyboard for confirm dialogs (prompt handles its own keys via the input).
  useEffect(() => {
    if (!current || current.kind !== "confirm") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        current.resolve(false);
        close();
      } else if (e.key === "Enter") {
        e.preventDefault();
        current.resolve(true);
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, close]);

  if (!current) return null;

  const submit = () => {
    current.resolve(current.kind === "prompt" ? value : true);
    close();
  };
  const cancel = () => {
    current.resolve(current.kind === "prompt" ? null : false);
    close();
  };

  return (
    <div className="bud-dialog-backdrop" onClick={cancel}>
      <div className="bud-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="bud-dialog-title">{current.title}</div>
        {current.message && <div className="bud-dialog-msg">{current.message}</div>}
        {current.kind === "prompt" && (
          <div className="bud-dialog-field">
            {current.label && <span className="bud-dialog-label">{current.label}</span>}
            <input
              className="bud-dialog-input"
              autoFocus
              value={value}
              placeholder={current.placeholder}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
                if (e.key === "Escape") cancel();
              }}
            />
          </div>
        )}
        <div className="bud-dialog-actions">
          <button className="bud-dialog-cancel" onClick={cancel}>
            {current.cancelLabel ?? "Cancel"}
          </button>
          <button
            className={`bud-dialog-ok ${current.danger ? "danger" : ""}`}
            autoFocus={current.kind === "confirm"}
            onClick={submit}
          >
            {current.confirmLabel ?? "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}
