import {
  IconBrandMysql,
  IconChevronDown,
  IconChevronRight,
  IconCopy,
  IconDatabase,
  IconDatabaseCog,
  IconEye,
  IconFilter,
  IconFolderOpen,
  IconLayoutSidebar,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSettings,
  IconTable,
  IconTablePlus,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { type ReactNode, useEffect, useState } from "react";
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
  children,
}: {
  label: string;
  count: number;
  defaultOpen?: boolean;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bud-objgroup">
      <div className="bud-objgroup-head" onClick={() => setOpen((v) => !v)}>
        <span className="bud-ds-arrow">
          {open ? <IconChevronDown size={12} stroke={2} /> : <IconChevronRight size={12} stroke={2} />}
        </span>
        <IconFolderOpen size={14} stroke={1.7} className="bud-objgroup-ic" />
        <span className="bud-objgroup-label">{label}</span>
        <span className="bud-objgroup-count">{count}</span>
      </div>
      {open && children && <div className="bud-objgroup-body">{children}</div>}
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

  useEffect(() => {
    loadConnections();
    scanLocal();
  }, [loadConnections, scanLocal]);

  return (
    <aside className="bud-sources">
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
        <span className="bud-tree-toolbar-sp" />
        <button title="Tree layout">
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
            <div className="bud-tnode root" onClick={() => setRootOpen((v) => !v)}>
              <span className="bud-tnode-arrow">
                {rootOpen ? <IconChevronDown size={13} stroke={2} /> : <IconChevronRight size={13} stroke={2} />}
              </span>
              <IconFolderOpen size={14} stroke={1.7} className="bud-tnode-ic" />
              <span className="bud-tnode-label">Demo Databases</span>
            </div>
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
          <div className="bud-ds-empty">{panel === "Scripts" ? "No scripts yet." : "No favorites yet."}</div>
        )}
      </div>
    </aside>
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
  const setTopView = useStore((s) => s.setTopView);
  const isActive = activeId === conn.id;
  const shownTables = filter
    ? tables.filter((t) => t.name.toLowerCase().includes(filter.toLowerCase()))
    : tables;
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
    { label: "Copy connection string", icon: (<IconCopy size={15} stroke={1.7} />), onClick: copyString },
    { divider: true },
    { label: "Remove data source", icon: (<IconTrash size={15} stroke={1.7} />), danger: true, onClick: remove },
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
        <span className="bud-src-name">{conn.name}</span>
      </div>
      {isActive && (open || !!filter) && (
        <div className="bud-ds-tables">
          {loadingTables ? (
            <div className="bud-ds-empty">Loading…</div>
          ) : (
            <ObjectGroup label="Databases" count={1} defaultOpen>
              <ObjectGroup label={`${dbName} (Default)`} count={1} defaultOpen>
                <ObjectGroup label="Schemas" count={1} defaultOpen>
                  <ObjectGroup label={schemaName} count={shownTables.length} defaultOpen>
                    <ObjectGroup label="Tables" count={shownTables.length} defaultOpen>
                      {shownTables.length === 0 ? (
                        <div className="bud-ds-empty">{filter ? "No match" : "No tables"}</div>
                      ) : (
                        shownTables.map((t) => <TableRow key={t.name} table={t.name} connectionId={conn.id} />)
                      )}
                    </ObjectGroup>
                    <ObjectGroup label="Views" count={0} />
                    <ObjectGroup label="Indexes" count={0} />
                    <ObjectGroup label="Sequences" count={0} />
                    <ObjectGroup label="Procedures" count={0} />
                    <ObjectGroup label="Functions" count={0} />
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

function TableRow({ table, connectionId }: { table: string; connectionId: string }) {
  const [ctx, setCtx] = useState<CtxAnchor | null>(null);
  const openTableData = useStore((s) => s.openTableData);
  const openView = useStore((s) => s.openView);
  const deleteView = useStore((s) => s.deleteView);
  const reload = useStore((s) => s.reload);
  const renameTable = useStore((s) => s.renameTable);
  const dropTable = useStore((s) => s.dropTable);
  const editTable = useStore((s) => s.editTable);
  const activeViewId = useStore((s) => s.activeViewId);
  const views = useStore((s) => s.views);
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

  const items: MenuItem[] = [
    { label: "Open", icon: (<IconFolderOpen size={15} stroke={1.7} />), onClick: () => void openTableData(table) },
    { label: "View data", icon: (<IconEye size={15} stroke={1.7} />), onClick: () => void openTableData(table) },
    { label: "Refresh", icon: (<IconRefresh size={15} stroke={1.7} />), onClick: () => void reload(table) },
    { divider: true },
    { label: "Rename table", icon: (<IconPencil size={15} stroke={1.7} />), onClick: () => void rename() },
    { label: "Drop table", icon: (<IconTrash size={15} stroke={1.7} />), danger: true, onClick: drop },
  ];

  return (
    <>
      <div
        className={`bud-table ${tableActive ? "active" : ""}`}
        onClick={() => openTableData(table)}
        onContextMenu={(e) => {
          e.preventDefault();
          setCtx({ x: e.clientX, y: e.clientY, items });
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
