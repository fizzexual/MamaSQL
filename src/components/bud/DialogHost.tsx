import { useEffect, useState } from "react";
import { useDialog } from "../../state/dialog";

/** Renders the active themed dialog (confirm / prompt). Mount once at the app root. */
export function DialogHost() {
  const current = useDialog((s) => s.current);
  const close = useDialog((s) => s.close);
  const [value, setValue] = useState("");
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    setValue(current?.defaultValue ?? "");
    setChecked(false);
  }, [current]);

  const submit = () => {
    if (!current) return;
    current.resolve(current.kind === "prompt" ? value : current.checkbox ? { ok: true, checked } : true);
    close();
  };
  const cancel = () => {
    if (!current) return;
    current.resolve(current.kind === "prompt" ? null : current.checkbox ? { ok: false, checked: false } : false);
    close();
  };

  // Keyboard for confirm dialogs (prompt handles its own keys via the input).
  useEffect(() => {
    if (!current || current.kind !== "confirm") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        submit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, checked, value]);

  if (!current) return null;

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
        {current.checkbox && (
          <label className="bud-dialog-check">
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
            <span>{current.checkbox}</span>
          </label>
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
