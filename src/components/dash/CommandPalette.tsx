import {
  IconBolt,
  IconCode,
  IconCornerDownLeft,
  IconDatabase,
  IconEraser,
  IconFileText,
  IconHistory,
  IconPlus,
  IconSearch,
  IconSettings,
  IconStar,
  IconTable,
  IconTerminal2,
} from "@tabler/icons-react";
import { type ComponentType, type KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../../state/store";

type Icon = ComponentType<{ size?: number; stroke?: number }>;
type Cmd = { id: string; group: string; label: string; hint?: string; Icon: Icon; run: () => void };

const GROUPS = ["Actions", "Navigate", "Connections", "Tables", "Scripts", "Favorites"];

export function CommandPalette({ onAddServer }: { onAddServer: () => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const connections = useStore((s) => s.connections);
  const tables = useStore((s) => s.schema.tables);
  const activeId = useStore((s) => s.activeConnectionId);
  const scripts = useStore((s) => s.scripts);
  const favorites = useStore((s) => s.favorites);
  const setTopView = useStore((s) => s.setTopView);
  const setView = useStore((s) => s.setView);
  const setSql = useStore((s) => s.setSql);
  const loadSql = useStore((s) => s.loadSql);
  const run = useStore((s) => s.run);
  const openAndIntrospect = useStore((s) => s.openAndIntrospect);
  const openTableData = useStore((s) => s.openTableData);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    const onEvt = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("mamasql:cmdk", onEvt);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mamasql:cmdk", onEvt);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setSel(0);
      const id = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  const close = () => setOpen(false);
  const act = (fn: () => void) => () => {
    fn();
    close();
  };

  const cmds: Cmd[] = useMemo(() => {
    const editor = () => {
      setTopView("data");
      setView("sql");
    };
    const list: Cmd[] = [
      { id: "a-query", group: "Actions", label: "New query", hint: "SQL", Icon: IconBolt, run: act(() => loadSql("")) },
      { id: "a-conn", group: "Actions", label: "New connection", Icon: IconPlus, run: act(onAddServer) },
      {
        id: "a-run",
        group: "Actions",
        label: "Run current query",
        hint: "⌘↵",
        Icon: IconCode,
        run: act(() => {
          editor();
          if (activeId) void run();
        }),
      },
      { id: "a-clear", group: "Actions", label: "Clear editor", Icon: IconEraser, run: act(() => setSql("")) },
      { id: "n-editor", group: "Navigate", label: "Query editor", Icon: IconTerminal2, run: act(editor) },
      {
        id: "n-data",
        group: "Navigate",
        label: "Data browser",
        Icon: IconTable,
        run: act(() => {
          setTopView("data");
          setView("data");
        }),
      },
      {
        id: "n-history",
        group: "Navigate",
        label: "SQL history",
        Icon: IconHistory,
        run: act(() => {
          setTopView("data");
          setView("history");
        }),
      },
      { id: "n-settings", group: "Navigate", label: "Settings", Icon: IconSettings, run: act(() => setTopView("settings")) },
    ];
    for (const c of connections) {
      list.push({
        id: `c-${c.id}`,
        group: "Connections",
        label: `Connect — ${c.name}`,
        hint: c.engine,
        Icon: IconDatabase,
        run: act(() => void openAndIntrospect(c.id)),
      });
    }
    for (const t of tables) {
      list.push({
        id: `t-${t.name}`,
        group: "Tables",
        label: `Open ${t.name}`,
        Icon: IconTable,
        run: act(() => void openTableData(t.name)),
      });
    }
    for (const s of scripts) {
      list.push({ id: `s-${s.id}`, group: "Scripts", label: s.name, Icon: IconFileText, run: act(() => loadSql(s.sql)) });
    }
    for (const f of favorites) {
      list.push({ id: `fav-${f.id}`, group: "Favorites", label: f.name, Icon: IconStar, run: act(() => loadSql(f.sql)) });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connections, tables, scripts, favorites, activeId]);

  const ql = q.trim().toLowerCase();
  const filtered = ql ? cmds.filter((c) => c.label.toLowerCase().includes(ql)) : cmds;
  const clampedSel = Math.min(sel, Math.max(0, filtered.length - 1));

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      filtered[clampedSel]?.run();
    }
  };

  if (!open) return null;

  return (
    <div className="cmdk-backdrop" onClick={close}>
      <div className="cmdk" onClick={(e) => e.stopPropagation()}>
        <div className="cmdk-input">
          <IconSearch size={16} stroke={1.8} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Search tables, run a query, jump anywhere…"
            spellCheck={false}
          />
        </div>
        <div className="cmdk-list">
          {filtered.length === 0 && <div className="cmdk-empty">No matches</div>}
          {GROUPS.map((group) => {
            const items = filtered.filter((c) => c.group === group);
            if (!items.length) return null;
            return (
              <div className="cmdk-group" key={group}>
                <div className="cmdk-group-h">{group}</div>
                {items.map((c) => {
                  const idx = filtered.indexOf(c);
                  return (
                    <button
                      key={c.id}
                      className={`cmdk-item ${idx === clampedSel ? "on" : ""}`}
                      onMouseEnter={() => setSel(idx)}
                      onClick={c.run}
                    >
                      <c.Icon size={16} stroke={1.7} />
                      <span className="cmdk-label">{c.label}</span>
                      {c.hint && <span className="cmdk-hint">{c.hint}</span>}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div className="cmdk-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> navigate
          </span>
          <span>
            <kbd>
              <IconCornerDownLeft size={11} stroke={2} />
            </kbd>{" "}
            select
          </span>
          <span>
            <kbd>esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
