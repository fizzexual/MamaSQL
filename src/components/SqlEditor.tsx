import { basicSetup } from "codemirror";
import { oneDark } from "@codemirror/theme-one-dark";
import { SQLite, sql } from "@codemirror/lang-sql";
import { Compartment, EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { useEffect, useRef } from "react";
import { useStore } from "../state/store";

// Build a { table: [columns] } map from the store for schema-aware completion.
function buildSchema(): Record<string, string[]> {
  const { schema } = useStore.getState();
  const out: Record<string, string[]> = {};
  for (const t of schema.tables) {
    out[t.name] = (schema.columnsByTable[t.name] ?? []).map((c) => c.name);
  }
  return out;
}

export function SqlEditor() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!host.current) return;
    const schemaComp = new Compartment();

    // Ctrl/Cmd+Enter runs the query (highest precedence so it wins).
    const runKey = Prec.highest(
      keymap.of([
        {
          key: "Mod-Enter",
          run: () => {
            void useStore.getState().run();
            return true;
          },
        },
      ]),
    );

    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: useStore.getState().sql,
        extensions: [
          runKey,
          basicSetup,
          oneDark,
          schemaComp.of(sql({ dialect: SQLite, schema: buildSchema() })),
          EditorView.lineWrapping,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) {
              const value = u.state.doc.toString();
              if (value !== useStore.getState().sql) useStore.getState().setSql(value);
            }
          }),
        ],
      }),
    });

    // Keep the editor in sync with external store changes (table clicks, history).
    const unsub = useStore.subscribe((state, prev) => {
      if (state.sql !== prev.sql) {
        const current = view.state.doc.toString();
        if (state.sql !== current) {
          view.dispatch({ changes: { from: 0, to: current.length, insert: state.sql } });
        }
      }
      if (state.schema !== prev.schema) {
        view.dispatch({
          effects: schemaComp.reconfigure(sql({ dialect: SQLite, schema: buildSchema() })),
        });
      }
    });

    return () => {
      unsub();
      view.destroy();
    };
  }, []);

  return (
    <div className="editor">
      <div className="editor-tabbar">
        <span className="tab active">Query 1</span>
      </div>
      <div className="editor-cm" ref={host} />
    </div>
  );
}
