import { type ReactNode, useEffect, useRef, useState } from "react";

export interface MenuItem {
  label?: string;
  icon?: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Render a separator line; other fields are ignored. */
  divider?: boolean;
}

export interface CtxAnchor {
  x: number;
  y: number;
  items: MenuItem[];
}

/** A right-click context menu positioned at the cursor and clamped to the viewport. */
export function ContextMenu({ anchor, onClose }: { anchor: CtxAnchor; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: anchor.x, top: anchor.y });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos({
      left: Math.min(anchor.x, window.innerWidth - width - 8),
      top: Math.min(anchor.y, window.innerHeight - height - 8),
    });
  }, [anchor.x, anchor.y]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div
        className="bud-menu-backdrop"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div ref={ref} className="bud-ctx-menu" style={{ left: pos.left, top: pos.top }}>
        {anchor.items.map((it, i) =>
          it.divider ? (
            <div key={i} className="bud-ctx-sep" />
          ) : (
            <button
              key={i}
              className={`bud-ctx-item ${it.danger ? "danger" : ""}`}
              disabled={it.disabled}
              onClick={() => {
                it.onClick?.();
                onClose();
              }}
            >
              <span className="bud-ctx-ic">{it.icon}</span>
              {it.label}
            </button>
          ),
        )}
      </div>
    </>
  );
}
