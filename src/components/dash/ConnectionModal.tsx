import { IconAlertTriangle, IconCheck, IconLoader2, IconRefresh, IconServer, IconX } from "@tabler/icons-react";
import { useState } from "react";
import { getBackend } from "../../ipc/backend";
import type { ConnectionConfig, Engine } from "../../ipc/types";
import { useStore } from "../../state/store";

const SYSTEM_DBS = new Set([
  "information_schema",
  "mysql",
  "performance_schema",
  "sys",
  "postgres",
  "template0",
  "template1",
]);

const ENGINES: { id: Engine; label: string }[] = [
  { id: "postgres", label: "PostgreSQL" },
  { id: "mysql", label: "MySQL" },
  { id: "sqlite", label: "SQLite" },
];

function errMsg(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as { message?: string }).message);
  return String(e);
}

export function ConnectionModal({ existing, onClose }: { existing?: ConnectionConfig | null; onClose: () => void }) {
  const saveConnection = useStore((s) => s.saveConnection);
  const openAndIntrospect = useStore((s) => s.openAndIntrospect);
  const editing = !!existing;

  const [engine, setEngine] = useState<Engine>(existing?.engine ?? "postgres");
  const [name, setName] = useState(existing?.name ?? "");
  const [host, setHost] = useState(existing?.host ?? "localhost");
  const [port, setPort] = useState(existing?.port != null ? String(existing.port) : "");
  const [database, setDatabase] = useState(existing?.database ?? "");
  const [username, setUsername] = useState(existing?.username ?? "");
  const [password, setPassword] = useState("");
  const [databases, setDatabases] = useState<string[] | null>(null);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; msg: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [busy, setBusy] = useState(false);

  const defaultPort = engine === "postgres" ? "5432" : engine === "mysql" ? "3306" : "";

  const draftCfg = (db: string): ConnectionConfig => ({
    id: existing?.id ?? `srv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim() || `${engine} @ ${host || "local"}`,
    engine,
    host: engine === "sqlite" ? null : host.trim() || "localhost",
    port: engine === "sqlite" ? null : Number(port || defaultPort) || null,
    database: db,
    username: engine === "sqlite" ? null : username.trim() || null,
  });

  const testAndList = async () => {
    setTesting(true);
    setStatus(null);
    try {
      const dbs = await getBackend().listDatabases(draftCfg(""), password || null);
      setDatabases(dbs);
      setStatus({ kind: "ok", msg: `Server reachable — ${dbs.length} database${dbs.length === 1 ? "" : "s"}` });
      if (dbs.length && !dbs.includes(database)) {
        setDatabase(dbs.find((d) => !SYSTEM_DBS.has(d)) ?? dbs[0]);
      }
    } catch (e) {
      setDatabases(null);
      setStatus({ kind: "error", msg: errMsg(e) });
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const cfg = draftCfg(database.trim());
      await saveConnection(cfg, password || null);
      await openAndIntrospect(cfg.id);
      onClose();
    } catch (e) {
      setStatus({ kind: "error", msg: errMsg(e) });
      setBusy(false);
    }
  };

  const canSave = engine === "sqlite" ? !!database.trim() : !!database.trim() && !!host.trim();

  return (
    <div className="dmodal-backdrop" onClick={onClose}>
      <div className="dmodal" onClick={(e) => e.stopPropagation()}>
        <div className="dmodal-head">
          <span className="dmodal-ic">
            <IconServer size={20} stroke={1.7} />
          </span>
          <div className="dmodal-head-t">
            <h3>{editing ? "Edit connection" : "Add connection"}</h3>
            <p>Connect a database to MamaSQL.</p>
          </div>
          <button className="dmodal-x" onClick={onClose} title="Close">
            <IconX size={17} stroke={1.8} />
          </button>
        </div>

        <div className="dmodal-body">
          <div className="dmodal-engines">
            {ENGINES.map((en) => (
              <button
                key={en.id}
                className={`dmodal-engine ${engine === en.id ? "on" : ""}`}
                onClick={() => {
                  setEngine(en.id);
                  setDatabases(null);
                  setStatus(null);
                }}
              >
                {en.label}
              </button>
            ))}
          </div>

          <label className="dfield">
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="My database" />
          </label>

          {engine !== "sqlite" ? (
            <>
              <div className="dfield-row">
                <label className="dfield">
                  <span>Host</span>
                  <input value={host} onChange={(e) => setHost(e.target.value)} />
                </label>
                <label className="dfield">
                  <span>Port</span>
                  <input value={port} onChange={(e) => setPort(e.target.value)} placeholder={defaultPort} />
                </label>
              </div>
              <div className="dfield-row">
                <label className="dfield">
                  <span>Username</span>
                  <input value={username} onChange={(e) => setUsername(e.target.value)} />
                </label>
                <label className="dfield">
                  <span>Password</span>
                  <input
                    type="password"
                    value={password}
                    placeholder={editing ? "•••••• (unchanged)" : ""}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
              </div>

              <button className="dmodal-test" onClick={testAndList} disabled={testing}>
                {testing ? <IconLoader2 size={15} className="dash-spin" /> : <IconRefresh size={15} stroke={1.8} />}
                {testing ? "Connecting…" : "Test connection & list databases"}
              </button>
              {status && (
                <div className={`dmodal-status ${status.kind}`}>
                  {status.kind === "ok" ? <IconCheck size={15} stroke={2} /> : <IconAlertTriangle size={15} stroke={1.8} />}
                  <span>{status.msg}</span>
                </div>
              )}

              <label className="dfield">
                <span>Database</span>
                {databases ? (
                  <select value={database} onChange={(e) => setDatabase(e.target.value)}>
                    {!databases.includes(database) && database && <option value={database}>{database}</option>}
                    {databases.map((d) => (
                      <option key={d} value={d}>
                        {d}
                        {SYSTEM_DBS.has(d) ? "  (system)" : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={database}
                    onChange={(e) => setDatabase(e.target.value)}
                    placeholder="test the connection to list, or type a name"
                  />
                )}
              </label>
            </>
          ) : (
            <label className="dfield">
              <span>Database file</span>
              <input value={database} onChange={(e) => setDatabase(e.target.value)} placeholder="C:\\path\\to\\database.sqlite" />
            </label>
          )}
        </div>

        <div className="dmodal-foot">
          <button className="dmodal-cancel" onClick={onClose}>
            Cancel
          </button>
          <button className="dmodal-save" onClick={save} disabled={!canSave || busy}>
            {busy ? "Saving…" : editing ? "Save changes" : "Connect"}
          </button>
        </div>
      </div>
    </div>
  );
}
