import { useEffect, useState } from "react";
import type { ConnectionConfig, Engine } from "../ipc/types";
import { useStore } from "../state/store";

export function ConnectionSidebar() {
  const connections = useStore((s) => s.connections);
  const activeId = useStore((s) => s.activeConnectionId);
  const loadConnections = useStore((s) => s.loadConnections);
  const openAndIntrospect = useStore((s) => s.openAndIntrospect);
  const deleteConnection = useStore((s) => s.deleteConnection);
  const createLocalDatabase = useStore((s) => s.createLocalDatabase);
  const detected = useStore((s) => s.detected);
  const scanLocal = useStore((s) => s.scanLocal);
  const addDetected = useStore((s) => s.addDetected);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    loadConnections();
    scanLocal();
  }, [loadConnections, scanLocal]);

  const newDetections = detected.filter((d) => !connections.some((c) => c.id === d.id));

  return (
    <section className="panel">
      <div className="panel-head">
        <span>Connections</span>
        <span className="head-actions">
          <button
            className="icon-btn"
            title="New local SQLite database (one click)"
            onClick={() => {
              const n = window.prompt("New local database name", "scratch");
              if (n) void createLocalDatabase(n);
            }}
          >
            🗄
          </button>
          <button className="icon-btn" title="New connection" onClick={() => setAdding((v) => !v)}>
            ＋
          </button>
        </span>
      </div>
      <ul className="conn-list">
        {connections.map((c) => (
          <li key={c.id} className={c.id === activeId ? "conn active" : "conn"}>
            <button className="conn-name" onClick={() => openAndIntrospect(c.id)}>
              <span className={`dot ${c.engine}`} />
              {c.name}
            </button>
            <button
              className="icon-btn danger"
              title="Delete"
              onClick={() => deleteConnection(c.id)}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      {newDetections.length > 0 && (
        <div className="detected">
          <div className="detected-head">🔎 Found locally</div>
          {newDetections.map((d) => (
            <div className="detected-item" key={d.id}>
              <span className={`dot ${d.engine}`} />
              <span className="detected-name">{d.name}</span>
              <button className="detected-add" onClick={() => addDetected(d)}>
                Add
              </button>
            </div>
          ))}
        </div>
      )}
      {adding && <ConnectionForm onDone={() => setAdding(false)} />}
    </section>
  );
}

function ConnectionForm({ onDone }: { onDone: () => void }) {
  const saveConnection = useStore((s) => s.saveConnection);
  const [form, setForm] = useState<ConnectionConfig>({
    id: "",
    name: "",
    engine: "sqlite",
    database: "",
    host: "",
    port: null,
    username: "",
  });
  const [password, setPassword] = useState("");
  const isSqlite = form.engine === "sqlite";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const id =
      form.id || form.name.toLowerCase().replace(/\s+/g, "-") || `conn-${Date.now()}`;
    await saveConnection({ ...form, id }, isSqlite ? null : password);
    onDone();
  };

  return (
    <form className="conn-form" onSubmit={submit}>
      <input
        placeholder="Name"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        required
      />
      <select
        value={form.engine}
        onChange={(e) => setForm({ ...form, engine: e.target.value as Engine })}
      >
        <option value="sqlite">SQLite</option>
        <option value="postgres">Postgres</option>
        <option value="mysql">MySQL</option>
      </select>
      {isSqlite ? (
        <input
          placeholder="File path (or :memory:)"
          value={form.database}
          onChange={(e) => setForm({ ...form, database: e.target.value })}
          required
        />
      ) : (
        <>
          <input
            placeholder="Host"
            value={form.host ?? ""}
            onChange={(e) => setForm({ ...form, host: e.target.value })}
          />
          <input
            placeholder="Port"
            type="number"
            value={form.port ?? ""}
            onChange={(e) =>
              setForm({ ...form, port: e.target.value ? Number(e.target.value) : null })
            }
          />
          <input
            placeholder="Database"
            value={form.database}
            onChange={(e) => setForm({ ...form, database: e.target.value })}
            required
          />
          <input
            placeholder="Username"
            value={form.username ?? ""}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
          />
          <input
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </>
      )}
      <div className="form-actions">
        <button type="submit" className="primary">
          Save
        </button>
        <button type="button" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}
