import { useState } from "react";
import type { ConnectionConfig, Engine } from "../../ipc/types";
import { useStore } from "../../state/store";

export function ServerModal({ onClose }: { onClose: () => void }) {
  const saveConnection = useStore((s) => s.saveConnection);
  const openAndIntrospect = useStore((s) => s.openAndIntrospect);

  const [engine, setEngine] = useState<Engine>("postgres");
  const [name, setName] = useState("");
  const [host, setHost] = useState("localhost");
  const [port, setPort] = useState("");
  const [database, setDatabase] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const defaultPort = engine === "postgres" ? "5432" : engine === "mysql" ? "3306" : "";

  const save = async () => {
    setBusy(true);
    setErr(null);
    const id = `srv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const cfg: ConnectionConfig = {
      id,
      name: name.trim() || `${engine} @ ${host || "local"}`,
      engine,
      host: engine === "sqlite" ? null : host.trim() || "localhost",
      port: engine === "sqlite" ? null : Number(port || defaultPort) || null,
      database: database.trim(),
      username: engine === "sqlite" ? null : username.trim() || null,
    };
    try {
      await saveConnection(cfg, password || null);
      await openAndIntrospect(id);
      onClose();
    } catch (e) {
      setErr(e && typeof e === "object" && "message" in e ? String((e as { message?: string }).message) : String(e));
      setBusy(false);
    }
  };

  return (
    <>
      <div className="bud-modal-backdrop" onClick={onClose} />
      <div className="bud-modal" onClick={(e) => e.stopPropagation()}>
        <div className="bud-modal-head">Add server</div>
        <div className="bud-modal-body">
          <label className="bud-field">
            <span>Engine</span>
            <select value={engine} onChange={(e) => setEngine(e.target.value as Engine)}>
              <option value="postgres">PostgreSQL</option>
              <option value="mysql">MySQL / MariaDB</option>
              <option value="sqlite">SQLite</option>
            </select>
          </label>
          <label className="bud-field">
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="My database" />
          </label>
          {engine !== "sqlite" ? (
            <>
              <div className="bud-field-row">
                <label className="bud-field">
                  <span>Host</span>
                  <input value={host} onChange={(e) => setHost(e.target.value)} />
                </label>
                <label className="bud-field port">
                  <span>Port</span>
                  <input value={port} onChange={(e) => setPort(e.target.value)} placeholder={defaultPort} />
                </label>
              </div>
              <label className="bud-field">
                <span>Database</span>
                <input value={database} onChange={(e) => setDatabase(e.target.value)} placeholder="postgres" />
              </label>
              <div className="bud-field-row">
                <label className="bud-field">
                  <span>Username</span>
                  <input value={username} onChange={(e) => setUsername(e.target.value)} />
                </label>
                <label className="bud-field">
                  <span>Password</span>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </label>
              </div>
            </>
          ) : (
            <label className="bud-field">
              <span>Database file</span>
              <input value={database} onChange={(e) => setDatabase(e.target.value)} placeholder="C:\\path\\to\\db.sqlite" />
            </label>
          )}
          {err && <div className="bud-modal-err">⚠ {err}</div>}
        </div>
        <div className="bud-modal-actions">
          <button className="bud-modal-cancel" onClick={onClose}>
            Cancel
          </button>
          <button className="bud-modal-save" onClick={save} disabled={busy}>
            {busy ? "Connecting…" : "Add server"}
          </button>
        </div>
      </div>
    </>
  );
}
