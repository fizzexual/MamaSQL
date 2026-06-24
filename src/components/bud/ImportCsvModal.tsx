import { IconFileImport, IconUpload } from "@tabler/icons-react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { fromCsv, inferColumns } from "../../lib/csv";
import { backdropV, centeredModalV, MotionButton } from "../../lib/motion";
import { useStore } from "../../state/store";
import { toast } from "../../state/toast";

interface Parsed {
  fileName: string;
  headers: string[];
  rows: string[][];
}

/** Import a CSV into a new or existing table. Opened via the `mamasql:import-csv` event. */
export function ImportCsvModal() {
  const [open, setOpen] = useState(false);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [mode, setMode] = useState<"create" | "append">("create");
  const [tableName, setTableName] = useState("");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const tables = useStore((s) => s.schema.tables);
  const activeId = useStore((s) => s.activeConnectionId);
  const importCsv = useStore((s) => s.importCsv);

  useEffect(() => {
    const onOpen = () => {
      if (!useStore.getState().activeConnectionId) {
        toast("Open a connection first.", "error");
        return;
      }
      setParsed(null);
      setMode("create");
      setOpen(true);
    };
    window.addEventListener("mamasql:import-csv", onOpen);
    return () => window.removeEventListener("mamasql:import-csv", onOpen);
  }, []);

  useEffect(() => {
    if (tables.length > 0 && !target) setTarget(tables[0].name);
  }, [tables, target]);

  const close = () => {
    setOpen(false);
    setParsed(null);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setParsed(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const onFile = async (file: File) => {
    const text = await file.text();
    const { headers, rows } = fromCsv(text);
    if (headers.length === 0) {
      toast("That file has no columns.", "error");
      return;
    }
    const base = file.name.replace(/\.[^.]+$/, "").replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "");
    setParsed({ fileName: file.name, headers, rows });
    setTableName(base || "imported");
    setMode(tables.length > 0 ? "create" : "create");
  };

  const run = async () => {
    if (!parsed || !activeId) return;
    const dest = mode === "create" ? tableName.trim() : target;
    if (!dest) {
      toast(mode === "create" ? "Enter a table name." : "Pick a table.", "error");
      return;
    }
    setBusy(true);
    await importCsv(dest, parsed.headers, parsed.rows, { create: mode === "create" });
    setBusy(false);
    close();
  };

  const cols = parsed ? inferColumns(parsed.headers, parsed.rows) : [];

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            key="import-bg"
            className="bud-modal-backdrop"
            variants={backdropV}
            initial="hidden"
            animate="show"
            exit="exit"
            onClick={close}
          />
        )}
        {open && (
          <motion.div
            key="import-modal"
            className="bud-modal bud-import"
            variants={centeredModalV}
            initial="hidden"
            animate="show"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bud-modal-head">
              <IconFileImport size={16} stroke={1.7} /> Import CSV
            </div>
        <div className="bud-modal-body">
          {!parsed ? (
            <button
              className="bud-import-drop"
              onClick={() => fileRef.current?.click()}
            >
              <IconUpload size={26} stroke={1.5} />
              <span>Choose a CSV file</span>
              <small>First row is treated as the column headers.</small>
            </button>
          ) : (
            <>
              <div className="bud-import-file">
                <strong>{parsed.fileName}</strong>
                <span>
                  {parsed.rows.length.toLocaleString()} rows · {parsed.headers.length} columns
                </span>
                <button className="bud-import-rechoose" onClick={() => fileRef.current?.click()}>
                  Change file
                </button>
              </div>

              <div className="bud-import-modes">
                <label className={mode === "create" ? "on" : ""}>
                  <input type="radio" checked={mode === "create"} onChange={() => setMode("create")} /> New table
                </label>
                <label className={`${mode === "append" ? "on" : ""} ${tables.length === 0 ? "disabled" : ""}`}>
                  <input
                    type="radio"
                    checked={mode === "append"}
                    disabled={tables.length === 0}
                    onChange={() => setMode("append")}
                  />{" "}
                  Append to existing
                </label>
              </div>

              {mode === "create" ? (
                <label className="bud-field">
                  <span>New table name</span>
                  <input value={tableName} onChange={(e) => setTableName(e.target.value)} placeholder="e.g. players" />
                </label>
              ) : (
                <label className="bud-field">
                  <span>Target table</span>
                  <select value={target} onChange={(e) => setTarget(e.target.value)}>
                    {tables.map((t) => (
                      <option key={t.name} value={t.name}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <div className="bud-import-preview">
                <table>
                  <thead>
                    <tr>
                      {parsed.headers.map((h, i) => (
                        <th key={i}>
                          {h}
                          {mode === "create" && <span className="bud-import-type">{cols[i].dataType}</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.slice(0, 5).map((r, ri) => (
                      <tr key={ri}>
                        {parsed.headers.map((_, ci) => (
                          <td key={ci}>{r[ci] ?? ""}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsed.rows.length > 5 && <div className="bud-import-more">+ {(parsed.rows.length - 5).toLocaleString()} more rows</div>}
              </div>
            </>
          )}
        </div>
            <div className="bud-modal-actions">
              <MotionButton className="bud-modal-cancel" onClick={close}>
                Cancel
              </MotionButton>
              <MotionButton className="bud-modal-save" onClick={run} disabled={!parsed || busy}>
                {busy ? "Importing…" : "Import"}
              </MotionButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <input
        ref={fileRef}
        id="bud-import-csv-file"
        type="file"
        accept=".csv,.tsv,.txt,text/csv"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
          e.target.value = "";
        }}
      />
    </>
  );
}
