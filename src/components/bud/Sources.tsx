import {
  IconBrandMysql,
  IconChevronDown,
  IconChevronRight,
  IconCode,
  IconColumnInsertRight,
  IconCopy,
  IconDatabase,
  IconDatabaseCog,
  IconEraser,
  IconEye,
  IconFileText,
  IconFilter,
  IconFolderOpen,
  IconHash,
  IconLayoutSidebar,
  IconLock,
  IconLockOpen,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconFileImport,
  IconGitCompare,
  IconSchema,
  IconSearch,
  IconSettings,
  IconStar,
  IconTable,
  IconTablePlus,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { confirmDialog, promptDialog } from "../../state/dialog";
import type { ConnectionConfig, Engine } from "../../ipc/types";
import { useStore } from "../../state/store";
import { ContextMenu, type CtxAnchor, type MenuItem } from "./ContextMenu";

const PANELS = ["Databases", "Scripts", "Favorites"] as const;

function EngineIcon({ engine }: { engine: Engine }) {
  if (engine === "mysql") return <IconBrandMysql size={15} stroke={1.7} />;
  return <IconDatabase size={14} stroke={1.7} />;
}

function connString(c: ConnectionConfig): string {
  if (c.engine === "sqlite") return `sqlite://${c.database}`;
  const user = c.username ? `${c.username}@` : "";
  const host = c.host ?? "localhost";
  const port = c.port ?? (c.engine === "postgres" ? 5432 : 3306);
  const scheme = c.engine === "postgres" ? "postgresql" : "mysql";
  return `${scheme}://${user}${host}:${port}/${c.database}`;
}

/** A collapsible object-type folder inside a connection (Tables, Views, …). */
function ObjectGroup({
  label,
  count,
  defaultOpen = false,
  menu,
  children,
}: {
  label: string;
  count: number;
  defaultOpen?: boolean;
  menu?: MenuItem[];
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [ctx, setCtx] = useState<CtxAnchor | null>(null);
  return (
    <div className="bud-objgroup">
      <div
        className="bud-objgroup-head"
        onClick={() => setOpen((v) => !v)}
        onContextMenu={
          menu
            ? (e) => {
                e.preventDefault();
                setCtx({ x: e.clientX, y: e.clientY, items: menu });
              }
            : undefined
        }
      >
        <span className="bud-ds-arrow">
          {open ? <IconChevronDown size={12} stroke={2} /> : <IconChevronRight size={12} stroke={2} />}
        </span>
        <IconFolderOpen size={14} stroke={1.7} className="bud-objgroup-ic" />
        <span className="bud-objgroup-label">{label}</span>
        <span className="bud-objgroup-count">{count}</span>
      </div>
      {open && children && <div className="bud-objgroup-body">{children}</div>}
      {ctx && <ContextMenu anchor={ctx} onClose={() => setCtx(null)} />}
    </div>
  );
}

export function Sources({
  onAddServer,
  onEditServer,
}: {
  onAddServer: () => void;
  onEditServer: (conn: ConnectionConfig) => void;
}) {
  const connections = useStore((s) => s.connections);
  const loadConnections = useStore((s) => s.loadConnections);
  const scanLocal = useStore((s) => s.scanLocal);
  const [filter, setFilter] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [panel, setPanel] = useState<(typeof PANELS)[number]>("Databases");
  const [rootOpen, setRootOpen] = useState(true);
  const [rootCtx, setRootCtx] = useState<CtxAnchor | null>(null);
  const [compact, setCompact] = useState(false);

  const rootMenu: MenuItem[] = [
    { label: "New connection…", icon: (<IconPlus size={15} stroke={1.7} />), onClick: onAddServer },
    { label: "Refresh all", icon: (<IconRefresh size={15} stroke={1.7} />), onClick: () => { void loadConnections(); void scanLocal(); } },
  ];

  useEffect(() => {
    loadConnections();
    scanLocal();
  }, [loadConnections, scanLocal]);

  return (
    <aside className={`bud-sources ${compact ? "compact" : ""}`}>
      <nav className="bud-panel-tabs">
        {PANELS.map((p) => (
          <button key={p} className={`bud-panel-tab ${panel === p ? "on" : ""}`} onClick={() => setPanel(p)}>
            {p}
          </button>
        ))}
      </nav>

      <div className="bud-tree-toolbar">
        <button title="New connection" onClick={onAddServer}>
          <IconPlus size={15} stroke={1.8} />
        </button>
        <button
          title="Refresh"
          onClick={() => {
            void loadConnections();
            void scanLocal();
          }}
        >
          <IconRefresh size={15} stroke={1.7} />
        </button>
        <button className={searchOpen ? "on" : ""} title="Filter objects" onClick={() => setSearchOpen((v) => !v)}>
          <IconFilter size={15} stroke={1.7} />
        </button>
        <button title="Schema diagram (ER)" onClick={() => window.dispatchEvent(new Event("mamasql:erd"))}>
          <IconSchema size={15} stroke={1.7} />
        </button>
        <button title="Import CSV" onClick={() => window.dispatchEvent(new Event("mamasql:import-csv"))}>
          <IconFileImport size={15} stroke={1.7} />
        </button>
        <button title="Schema diff (compare connections)" onClick={() => window.dispatchEvent(new Event("mamasql:schema-diff"))}>
          <IconGitCompare size={15} stroke={1.7} />
        </button>
        <button
          className={compact ? "on" : ""}
          title={compact ? "Comfortable spacing" : "Compact spacing"}
          onClick={() => setCompact((v) => !v)}
        >
          <IconLayoutSidebar size={15} stroke={1.7} />
        </button>
      </div>

      {searchOpen && (
        <div className="bud-src-search">
          <IconSearch size={14} stroke={1.7} />
          <input autoFocus placeholder="Filter objects…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          {filter && (
            <button className="bud-src-search-x" title="Clear" onClick={() => setFilter("")}>
              <IconX size={13} stroke={1.9} />
            </button>
          )}
        </div>
      )}

      <div className="bud-sources-list">
        {panel === "Databases" ? (
          <>
            <div
              className="bud-tnode root"
              onClick={() => setRootOpen((v) => !v)}
              onContextMenu={(e) => {
                e.preventDefault();
                setRootCtx({ x: e.clientX, y: e.clientY, items: rootMenu });
              }}
            >
              <span className="bud-tnode-arrow">
                {rootOpen ? <IconChevronDown size={13} stroke={2} /> : <IconChevronRight size={13} stroke={2} />}
              </span>
              <IconFolderOpen size={14} stroke={1.7} className="bud-tnode-ic" />
              <span className="bud-tnode-label">Connections</span>
            </div>
            {rootCtx && <ContextMenu anchor={rootCtx} onClose={() => setRootCtx(null)} />}
            {rootOpen && (
              <div className="bud-tree-children">
                {connections.length === 0 ? (
                  <div className="bud-ds-empty">No connections yet</div>
                ) : (
                  connections.map((c) => (
                    <Datasource key={c.id} conn={c} onEditServer={onEditServer} filter={filter} />
                  ))
                )}
              </div>
            )}
          </>
        ) : (
          <SavedList kind={panel} />
        )}
      </div>
    </aside>
  );
}

/** The Scripts / Favorites panels: saved SQL snippets, click to load, ✕ to delete. */
function SavedList({ kind }: { kind: "Scripts" | "Favorites" }) {
  const scripts = useStore((s) => s.scripts);
  const favorites = useStore((s) => s.favorites);
  const loadSql = useStore((s) => s.loadSql);
  const deleteScript = useStore((s) => s.deleteScript);
  const deleteFavorite = useStore((s) => s.deleteFavorite);
  const items = kind === "Scripts" ? scripts : favorites;
  const del = kind === "Scripts" ? deleteScript : deleteFavorite;
  const Icon = kind === "Scripts" ? IconFileText : IconStar;

  if (items.length === 0) {
    return (
      <div className="bud-ds-empty">
        {kind === "Scripts"
          ? "No saved scripts. Use the Save icon in the editor toolbar."
          : "No favorites. Use the ★ icon in the editor toolbar."}
      </div>
    );
  }

  return (
    <div className="bud-saved-list">
      {items.map((it) => (
        <div key={it.id} className="bud-saved-row" onClick={() => loadSql(it.sql)} title={it.sql}>
          <span className="bud-saved-ic">
            <Icon size={14} stroke={1.7} />
          </span>
          <span className="bud-saved-name">{it.name}</span>
          <button
            className="bud-saved-del"
            title="Delete"
            onClick={(e) => {
              e.stopPropagation();
              del(it.id);
            }}
          >
            <IconTrash size={13} stroke={1.7} />
          </button>
        </div>
      ))}
    </div>
  );
}

function Datasource({
  conn,
  onEditServer,
  filter,
}: {
  conn: ConnectionConfig;
  onEditServer: (conn: ConnectionConfig) => void;
  filter: string;
}) {
  const [open, setOpen] = useState(true);
  const [ctx, setCtx] = useState<CtxAnchor | null>(null);
  const activeId = useStore((s) => s.activeConnectionId);
  const tables = useStore((s) => s.schema.tables);
  const loadingTables = useStore((s) => s.loadingTables);
  const openAndIntrospect = useStore((s) => s.openAndIntrospect);
  const deleteConnection = useStore((s) => s.deleteConnection);
  const saveConnection = useStore((s) => s.saveConnection);
  const createTable = useStore((s) => s.createTable);
  const dropTables = useStore((s) => s.dropTables);
  const clearTables = useStore((s) => s.clearTables);
  const setTopView = useStore((s) => s.setTopView);
  const toggleReadOnly = useStore((s) => s.toggleReadOnly);
  const isReadOnly = useStore((s) => s.readOnlyConns.includes(conn.id));
  const isActive = activeId === conn.id;
  const shownTables = filter
    ? tables.filter((t) => t.name.toLowerCase().includes(filter.toLowerCase()))
    : tables;

  // Multi-select of tables (Ctrl/Cmd-click toggles, Shift-click ranges).
  const [selTables, setSelTables] = useState<string[]>([]);
  const anchorRef = useRef<string | null>(null);
  const tableNames = shownTables.map((t) => t.name);
  // biome-ignore lint/correctness/useExhaustiveDependencies: clear selection whenever the table set changes
  useEffect(() => {
    setSelTables([]);
    anchorRef.current = null;
  }, [conn.id, tables]);
  const activateTable = (name: string, e: React.MouseEvent): boolean => {
    if (e.altKey) {
      setSelTables((s) => (s.includes(name) ? s.filter((x) => x !== name) : [...s, name]));
      anchorRef.current = name;
      return true;
    }
    if (e.shiftKey && anchorRef.current) {
      const a = tableNames.indexOf(anchorRef.current);
      const b = tableNames.indexOf(name);
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        setSelTables(tableNames.slice(lo, hi + 1));
        return true;
      }
    }
    setSelTables([]);
    anchorRef.current = name;
    return false;
  };
  const schemaName = conn.engine === "postgres" ? "public" : "main";
  const dbName = conn.database || "database";

  const toggle = async () => {
    if (!isActive) await openAndIntrospect(conn.id);
    setOpen((v) => (isActive ? !v : true));
  };

  const newTable = async () => {
    const name = await promptDialog({ title: "New table", label: "Table name", placeholder: "e.g. invoices" });
    if (!name?.trim()) return;
    if (!isActive) await openAndIntrospect(conn.id);
    await createTable(name.trim(), [{ name: "id", dataType: "INTEGER", nullable: false, primaryKey: true }]);
    setOpen(true);
  };
  const rename = async () => {
    const name = await promptDialog({ title: "Rename data source", label: "Name", defaultValue: conn.name });
    if (!name?.trim() || name.trim() === conn.name) return;
    await saveConnection({ ...conn, name: name.trim() }, null);
  };
  const copyString = () => void navigator.clipboard?.writeText(connString(conn)).catch(() => {});
  const remove = async () => {
    if (
      await confirmDialog({
        title: "Delete data source",
        message: `Delete "${conn.name}"? This removes the saved connection.`,
        confirmLabel: "Delete",
        danger: true,
      })
    ) {
      void deleteConnection(conn.id);
    }
  };

  const items: MenuItem[] = [
    {
      label: isActive ? "Open (selected)" : "Connect",
      icon: (<IconFolderOpen size={15} stroke={1.7} />),
      disabled: isActive,
      onClick: () => void openAndIntrospect(conn.id),
    },
    { label: "Refresh", icon: (<IconRefresh size={15} stroke={1.7} />), onClick: () => void openAndIntrospect(conn.id) },
    { label: "New table", icon: (<IconTablePlus size={15} stroke={1.7} />), onClick: () => void newTable() },
    { divider: true },
    { label: "Rename", icon: (<IconPencil size={15} stroke={1.7} />), onClick: () => void rename() },
    { label: "Edit connection…", icon: (<IconDatabaseCog size={15} stroke={1.7} />), onClick: () => onEditServer(conn) },
    {
      label: "Properties",
      icon: (<IconSettings size={15} stroke={1.7} />),
      onClick: () => {
        void openAndIntrospect(conn.id);
        setTopView("settings");
      },
    },
    {
      label: isReadOnly ? "Read-only mode (on)" : "Read-only mode",
      icon: isReadOnly ? (<IconLock size={15} stroke={1.7} />) : (<IconLockOpen size={15} stroke={1.7} />),
      onClick: () => toggleReadOnly(conn.id),
    },
    { label: "Copy connection string", icon: (<IconCopy size={15} stroke={1.7} />), onClick: copyString },
    { divider: true },
    { label: "Remove data source", icon: (<IconTrash size={15} stroke={1.7} />), danger: true, onClick: remove },
  ];

  const refresh = () => void openAndIntrospect(conn.id);
  const refreshMenu: MenuItem[] = [{ label: "Refresh", icon: (<IconRefresh size={15} stroke={1.7} />), onClick: refresh }];
  // Views/Indexes/Sequences/… don't have a create flow yet, so the folder menu
  // is just Refresh (no permanently-disabled "New …" placeholder).
  const folderMenu = (_singular: string): MenuItem[] => [
    { label: "Refresh", icon: (<IconRefresh size={15} stroke={1.7} />), onClick: refresh },
  ];
  const allNames = tables.map((t) => t.name);
  const tablesMenu: MenuItem[] = [
    { label: "New table…", icon: (<IconTablePlus size={15} stroke={1.7} />), onClick: () => void newTable() },
    { label: "Refresh", icon: (<IconRefresh size={15} stroke={1.7} />), onClick: refresh },
    { divider: true },
    {
      label: `Clear all tables (delete rows)${allNames.length ? ` · ${allNames.length}` : ""}`,
      icon: (<IconEraser size={15} stroke={1.7} />),
      disabled: allNames.length === 0,
      onClick: () => void clearTables(allNames),
    },
    {
      label: `Delete all tables${allNames.length ? ` · ${allNames.length}` : ""}`,
      icon: (<IconTrash size={15} stroke={1.7} />),
      danger: true,
      disabled: allNames.length === 0,
      onClick: () => void dropTables(allNames),
    },
    { divider: true },
    { label: "Reload schema", icon: (<IconDatabaseCog size={15} stroke={1.7} />), onClick: refresh },
  ];

  return (
    <div className={`bud-ds ${isActive ? "connected" : ""}`}>
      <div
        className="bud-src ds"
        onClick={toggle}
        onContextMenu={(e) => {
          e.preventDefault();
          setCtx({ x: e.clientX, y: e.clientY, items });
        }}
      >
        <span className="bud-ds-arrow">
          {isActive && open ? <IconChevronDown size={13} stroke={2} /> : <IconChevronRight size={13} stroke={2} />}
        </span>
        <span className="bud-src-ic ds-engine">
          <EngineIcon engine={conn.engine} />
        </span>
        {conn.env && <span className={`bud-ds-env ${conn.env}`} title={`${conn.env} environment`} />}
        <span className="bud-src-name">{conn.name}</span>
        {isReadOnly && <IconLock size={12} stroke={1.9} className="bud-ds-ro" />}
      </div>
      {isActive && (open || !!filter) && (
        <div className="bud-ds-tables">
          {loadingTables ? (
            <div className="bud-ds-empty">Loading…</div>
          ) : (
            <ObjectGroup label="Databases" count={1} defaultOpen menu={refreshMenu}>
              <ObjectGroup label={`${dbName} (Default)`} count={1} defaultOpen menu={refreshMenu}>
                <ObjectGroup label="Schemas" count={1} defaultOpen menu={refreshMenu}>
                  <ObjectGroup label={schemaName} count={shownTables.length} defaultOpen menu={refreshMenu}>
                    <ObjectGroup label="Tables" count={shownTables.length} defaultOpen menu={tablesMenu}>
                      {shownTables.length === 0 ? (
                        <div className="bud-ds-empty">{filter ? "No match" : "No tables"}</div>
                      ) : (
                        shownTables.map((t) => (
                          <TableRow
                            key={t.name}
                            table={t.name}
                            connectionId={conn.id}
                            selected={selTables.includes(t.name)}
                            selectedNames={selTables}
                            onActivate={activateTable}
                          />
                        ))
                      )}
                    </ObjectGroup>
                    <ObjectGroup label="Views" count={0} menu={folderMenu("view")} />
                    <ObjectGroup label="Indexes" count={0} menu={folderMenu("index")} />
                    <ObjectGroup label="Sequences" count={0} menu={folderMenu("sequence")} />
                    <ObjectGroup label="Procedures" count={0} menu={folderMenu("procedure")} />
                    <ObjectGroup label="Functions" count={0} menu={folderMenu("function")} />
                  </ObjectGroup>
                </ObjectGroup>
              </ObjectGroup>
            </ObjectGroup>
          )}
        </div>
      )}
      {ctx && <ContextMenu anchor={ctx} onClose={() => setCtx(null)} />}
    </div>
  );
}

function TableRow({
  table,
  connectionId,
  selected = false,
  selectedNames = [],
  onActivate,
}: {
  table: string;
  connectionId: string;
  selected?: boolean;
  selectedNames?: string[];
  onActivate?: (name: string, e: React.MouseEvent) => boolean;
}) {
  const [ctx, setCtx] = useState<CtxAnchor | null>(null);
  const openTableData = useStore((s) => s.openTableData);
  const openView = useStore((s) => s.openView);
  const deleteView = useStore((s) => s.deleteView);
  const reload = useStore((s) => s.reload);
  const renameTable = useStore((s) => s.renameTable);
  const dropTable = useStore((s) => s.dropTable);
  const dropTables = useStore((s) => s.dropTables);
  const clearTables = useStore((s) => s.clearTables);
  const editTable = useStore((s) => s.editTable);
  const activeViewId = useStore((s) => s.activeViewId);
  const views = useStore((s) => s.views);
  const loadSql = useStore((s) => s.loadSql);
  const addColumn = useStore((s) => s.addColumn);
  const showTableDdl = useStore((s) => s.showTableDdl);
  const myViews = views.filter((v) => v.connectionId === connectionId && v.table === table);
  const tableActive = editTable?.table === table && activeViewId === null;

  const rename = async () => {
    const name = await promptDialog({ title: "Rename table", label: "Name", defaultValue: table });
    if (!name?.trim() || name.trim() === table) return;
    await renameTable(table, name.trim());
  };
  const drop = async () => {
    if (
      await confirmDialog({
        title: "Drop table",
        message: `Drop "${table}"? This permanently deletes the table and all its rows.`,
        confirmLabel: "Drop",
        danger: true,
      })
    ) {
      void dropTable(table);
    }
  };

  const addColumnTo = async () => {
    const name = await promptDialog({ title: "New column", label: "Column name", placeholder: "e.g. created_at" });
    if (!name?.trim()) return;
    const dataType =
      (await promptDialog({ title: "Column type", label: "Type (TEXT, INTEGER, REAL, DATE, …)", defaultValue: "TEXT" }))?.trim() ||
      "TEXT";
    void addColumn(table, { name: name.trim(), dataType, nullable: true, primaryKey: false });
  };
  const copyName = () => void navigator.clipboard?.writeText(table).catch(() => {});

  const items: MenuItem[] = [
    { label: "Open", icon: (<IconFolderOpen size={15} stroke={1.7} />), onClick: () => void openTableData(table) },
    { label: "Open in new tab", icon: (<IconPlus size={15} stroke={1.7} />), onClick: () => void openTableData(table, { newTab: true }) },
    { label: "View data", icon: (<IconEye size={15} stroke={1.7} />), onClick: () => void openTableData(table) },
    { label: "Refresh", icon: (<IconRefresh size={15} stroke={1.7} />), onClick: () => void reload(table) },
    { divider: true },
    { label: "Generate SELECT", icon: (<IconCode size={15} stroke={1.7} />), onClick: () => loadSql(`SELECT * FROM ${table} LIMIT 100;`) },
    { label: "Show CREATE (DDL)", icon: (<IconSchema size={15} stroke={1.7} />), onClick: () => void showTableDdl(table) },
    { label: "Count rows", icon: (<IconHash size={15} stroke={1.7} />), onClick: () => loadSql(`SELECT count(*) FROM ${table};`) },
    { label: "Add column…", icon: (<IconColumnInsertRight size={15} stroke={1.7} />), onClick: () => void addColumnTo() },
    { label: "Copy name", icon: (<IconCopy size={15} stroke={1.7} />), onClick: copyName },
    { divider: true },
    { label: "Rename table", icon: (<IconPencil size={15} stroke={1.7} />), onClick: () => void rename() },
    { label: "Drop table", icon: (<IconTrash size={15} stroke={1.7} />), danger: true, onClick: () => void drop() },
  ];

  // When several tables are multi-selected, right-clicking one shows bulk actions.
  const multi = selectedNames.length > 1 && selectedNames.includes(table);
  const bulkItems: MenuItem[] = [
    { label: `${selectedNames.length} tables selected`, disabled: true },
    { divider: true },
    {
      label: `Clear ${selectedNames.length} tables (delete rows)`,
      icon: (<IconEraser size={15} stroke={1.7} />),
      onClick: () => void clearTables(selectedNames),
    },
    {
      label: `Drop ${selectedNames.length} tables`,
      icon: (<IconTrash size={15} stroke={1.7} />),
      danger: true,
      onClick: () => void dropTables(selectedNames),
    },
  ];
  const menuItems = multi ? bulkItems : items;

  return (
    <>
      <div
        className={`bud-table ${tableActive ? "active" : ""} ${selected ? "multi" : ""}`}
        onClick={(e) => {
          // Ctrl/Cmd-click opens the table in an additional tab.
          if (e.metaKey || e.ctrlKey) {
            void openTableData(table, { newTab: true });
            return;
          }
          const handled = onActivate?.(table, e) ?? false;
          if (!handled) void openTableData(table);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          setCtx({ x: e.clientX, y: e.clientY, items: menuItems });
        }}
      >
        <span className="bud-table-ic">
          <IconTable size={14} stroke={1.7} />
        </span>
        {table}
      </div>
      {myViews.map((v) => (
        <div
          key={v.id}
          className={`bud-table bud-view ${activeViewId === v.id ? "active" : ""}`}
          onClick={() => openView(v)}
        >
          <span className="bud-table-ic">
            <IconFilter size={14} stroke={1.7} />
          </span>
          <span className="bud-src-name">{v.name}</span>
          <button
            className="bud-view-del"
            title="Delete view"
            onClick={(e) => {
              e.stopPropagation();
              deleteView(v.id);
            }}
          >
            <IconX size={13} stroke={1.8} />
          </button>
        </div>
      ))}
      {ctx && <ContextMenu anchor={ctx} onClose={() => setCtx(null)} />}
    </>
  );
}
