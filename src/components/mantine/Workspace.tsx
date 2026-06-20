import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ActionIcon,
  AppShell,
  Avatar,
  Badge,
  Box,
  Button,
  Center,
  Divider,
  FileButton,
  Group,
  Loader,
  Modal,
  NavLink,
  Paper,
  ScrollArea,
  Stack,
  Table,
  Tabs,
  Text,
  Textarea,
  ThemeIcon,
  Title,
} from "@mantine/core";
import {
  IconColumns,
  IconDatabase,
  IconDeviceFloppy,
  IconDownload,
  IconKey,
  IconPencil,
  IconPlayerPlay,
  IconPlus,
  IconRefresh,
  IconTable,
  IconTrash,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import { getBackend } from "../../ipc/backend";
import type { QueryResult } from "../../ipc/types";
import { download, fromCsv, toCsv } from "../../lib/csv";
import { fieldKind } from "../bud/fieldInput";
import { MantineField } from "./MantineField";
import { useStore } from "../../state/store";

const backend = getBackend();
type Tab = "data" | "sql" | "structure" | "history";

const PILL = ["violet", "teal", "orange", "blue", "pink", "grape", "cyan"];
function pillColor(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PILL[h % PILL.length];
}
function typeTag(t: string) {
  const u = t.toUpperCase();
  if (/INT|SERIAL|NUM|DEC|REAL|FLOAT|DOUBLE|BIGINT/.test(u)) return "123";
  if (/DATE|TIME/.test(u)) return "date";
  if (/BOOL/.test(u)) return "bool";
  return "abc";
}

/** Editable form for one row, in the right Aside. Keyed by row so it re-inits. */
function RowForm({
  result,
  tableName,
  rowIndex,
  pkIdx,
  samplesByCol,
  onField,
  onDelete,
  onClose,
}: {
  result: QueryResult;
  tableName: string;
  rowIndex: number;
  pkIdx: number;
  samplesByCol: unknown[][];
  onField: (colIndex: number, value: unknown) => Promise<void>;
  onDelete: () => void;
  onClose: () => void;
}) {
  const row = result.rows[rowIndex];
  const [draft, setDraft] = useState<Record<string, unknown>>(() => {
    const d: Record<string, unknown> = {};
    result.columns.forEach((c, i) => (d[c.name] = row[i]));
    return d;
  });
  const [busy, setBusy] = useState(false);
  const canEdit = pkIdx >= 0;

  const save = async () => {
    setBusy(true);
    for (let ci = 0; ci < result.columns.length; ci++) {
      if (ci === pkIdx) continue;
      const n = result.columns[ci].name;
      if (String(draft[n] ?? "") !== String(row[ci] ?? "")) await onField(ci, draft[n]);
    }
    setBusy(false);
  };

  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Group gap={8}>
          <IconPencil size={17} />
          <Text fw={700}>Edit row</Text>
        </Group>
        <ActionIcon variant="subtle" color="gray" onClick={onClose} aria-label="Close">
          <IconX size={16} />
        </ActionIcon>
      </Group>
      <Badge variant="light" radius="sm" leftSection={<IconTable size={12} />}>
        {tableName}
      </Badge>
      {!canEdit && (
        <Text size="xs" c="orange.7">
          No primary key — this table is read-only.
        </Text>
      )}
      {result.columns.map((col, ci) => (
        <MantineField
          key={col.name}
          col={col}
          value={draft[col.name]}
          samples={samplesByCol[ci] ?? []}
          disabled={ci === pkIdx || !canEdit}
          onChange={(v) => setDraft((d) => ({ ...d, [col.name]: v }))}
        />
      ))}
      <Group grow mt="xs">
        <Button
          variant="light"
          color="red"
          leftSection={<IconTrash size={16} />}
          disabled={!canEdit}
          onClick={onDelete}
        >
          Delete
        </Button>
        <Button leftSection={<IconDeviceFloppy size={16} />} loading={busy} disabled={!canEdit} onClick={save}>
          Save
        </Button>
      </Group>
    </Stack>
  );
}

export function Workspace() {
  const connections = useStore((s) => s.connections);
  const activeId = useStore((s) => s.activeConnectionId);
  const tables = useStore((s) => s.schema.tables);
  const columnsByTable = useStore((s) => s.schema.columnsByTable);
  const editTable = useStore((s) => s.editTable);
  const result = useStore((s) => s.result);
  const loadingResult = useStore((s) => s.loadingResult);
  const inspectorRow = useStore((s) => s.inspectorRow);
  const history = useStore((s) => s.history);
  const detected = useStore((s) => s.detected);

  const loadConnections = useStore((s) => s.loadConnections);
  const scanLocal = useStore((s) => s.scanLocal);
  const openAndIntrospect = useStore((s) => s.openAndIntrospect);
  const openTableData = useStore((s) => s.openTableData);
  const editCell = useStore((s) => s.editCell);
  const deleteRowAt = useStore((s) => s.deleteRowAt);
  const addRow = useStore((s) => s.addRow);
  const addColumn = useStore((s) => s.addColumn);
  const dropTable = useStore((s) => s.dropTable);
  const renameTable = useStore((s) => s.renameTable);
  const refresh = useStore((s) => s.refresh);
  const importCsv = useStore((s) => s.importCsv);
  const addDetected = useStore((s) => s.addDetected);
  const createLocalDatabase = useStore((s) => s.createLocalDatabase);
  const openInspector = useStore((s) => s.openInspector);
  const closeInspector = useStore((s) => s.closeInspector);
  const loadHistory = useStore((s) => s.loadHistory);

  const [tab, setTab] = useState<Tab>("data");
  const [sqlText, setSqlText] = useState("SELECT 1;");
  const [sqlResult, setSqlResult] = useState<QueryResult | null>(null);
  const [sqlRunning, setSqlRunning] = useState(false);
  const [sqlError, setSqlError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addDraft, setAddDraft] = useState<Record<string, unknown>>({});

  useEffect(() => {
    loadConnections();
    scanLocal();
  }, [loadConnections, scanLocal]);
  useEffect(() => {
    if (!activeId && connections.length > 0) void openAndIntrospect(connections[0].id);
  }, [activeId, connections, openAndIntrospect]);
  useEffect(() => {
    if (activeId && !editTable && tables.length > 0) void openTableData(tables[0].name);
  }, [activeId, editTable, tables, openTableData]);
  useEffect(() => {
    if (editTable) setSqlText(`SELECT * FROM ${editTable.table} LIMIT 100;`);
  }, [editTable?.table]);
  useEffect(() => {
    if (tab === "history") void loadHistory();
  }, [tab, loadHistory]);

  const appName = connections.find((c) => c.id === activeId)?.name ?? "MamaSQL";
  const tableName = editTable?.table ?? "";
  const cols = editTable ? columnsByTable[editTable.table] ?? [] : [];
  const newDetections = detected.filter((d) => !connections.some((c) => c.id === d.id));
  const pkColName = editTable?.pkColumn ?? null;
  const pkIdx = result && pkColName ? result.columns.findIndex((c) => c.name === pkColName) : -1;
  const samplesByCol = useMemo(
    () => (result ? result.columns.map((_, ci) => result.rows.map((r) => r[ci])) : []),
    [result],
  );

  const runSql = async () => {
    if (!activeId) return;
    setSqlRunning(true);
    setSqlError(null);
    try {
      const r = await backend.runQuery(activeId, sqlText);
      setSqlResult(r);
      void loadHistory();
    } catch (e) {
      setSqlError(e && typeof e === "object" && "message" in e ? String((e as { message?: string }).message) : String(e));
      setSqlResult(null);
    }
    setSqlRunning(false);
  };
  const onImportFile = async (file: File | null) => {
    if (!file || !editTable) return;
    const { headers, rows } = fromCsv(await file.text());
    if (headers.length && rows.length) await importCsv(editTable.table, headers, rows);
  };
  const addColumnPrompt = () => {
    const n = window.prompt("New column name");
    if (!n?.trim()) return;
    const t = window.prompt("Type (TEXT, INTEGER, REAL, DATE…)", "TEXT")?.trim() || "TEXT";
    void addColumn(tableName, { name: n.trim(), dataType: t, nullable: true, primaryKey: false });
  };
  const saveAdd = () => {
    if (!result) return;
    const c: string[] = [];
    const v: unknown[] = [];
    result.columns.forEach((col) => {
      const val = addDraft[col.name];
      if (val !== undefined && val !== "") {
        c.push(col.name);
        v.push(val);
      }
    });
    void addRow(c, v);
    setAddDraft({});
    setAddOpen(false);
  };

  const renderCell = (cell: unknown, ci: number) => {
    if (cell == null) return <Text c="dimmed" fs="italic" size="sm">null</Text>;
    if (result && fieldKind(result.columns[ci], samplesByCol[ci] ?? []) === "select")
      return (
        <Badge variant="light" radius="sm" color={pillColor(String(cell))} tt="none" fw={500}>
          {String(cell)}
        </Badge>
      );
    return String(cell);
  };

  const dataTable =
    loadingResult ? (
      <Center h={240}>
        <Loader />
      </Center>
    ) : result && result.columns.length > 0 ? (
      <Table.ScrollContainer minWidth={560} type="native">
        <Table highlightOnHover stickyHeader verticalSpacing="xs" horizontalSpacing="md" striped="odd">
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={48}>#</Table.Th>
              {result.columns.map((c) => (
                <Table.Th key={c.name}>
                  <Group gap={6} wrap="nowrap">
                    <Badge size="xs" variant="default" radius="sm" tt="none" c="dimmed">
                      {typeTag(c.dataType)}
                    </Badge>
                    {c.name}
                  </Group>
                </Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {result.rows.map((r, ri) => (
              <Table.Tr
                key={ri}
                onClick={() => openInspector(ri)}
                bg={ri === inspectorRow ? "indigo.0" : undefined}
                style={{ cursor: "pointer" }}
              >
                <Table.Td c="dimmed">{ri + 1}</Table.Td>
                {r.map((cell, ci) => (
                  <Table.Td key={ci}>{renderCell(cell, ci)}</Table.Td>
                ))}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    ) : (
      <Center h={240}>
        <Text c="dimmed">{tableName ? "Empty table" : "Pick a table on the left"}</Text>
      </Center>
    );

  const sheetHeader = (title: string, tools: ReactNode) => (
    <Group justify="space-between" p="sm" style={{ borderBottom: "1px solid var(--mantine-color-gray-2)" }}>
      <Group gap={8}>
        <IconTable size={18} color="var(--mantine-color-indigo-6)" />
        <Title order={5}>{title}</Title>
      </Group>
      <Group gap="xs">{tools}</Group>
    </Group>
  );

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 264, breakpoint: "sm" }}
      aside={{ width: 344, breakpoint: "md" }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="lg" wrap="nowrap">
            <Group gap={8}>
              <ThemeIcon variant="light" radius="md" size="md">
                <IconDatabase size={18} />
              </ThemeIcon>
              <Text fw={800} size="md">
                MamaSQL
              </Text>
            </Group>
            <Tabs value={tab} onChange={(v) => setTab((v as Tab) ?? "data")} variant="pills" radius="xl">
              <Tabs.List>
                <Tabs.Tab value="data">Data</Tabs.Tab>
                <Tabs.Tab value="sql">SQL</Tabs.Tab>
                <Tabs.Tab value="structure">Structure</Tabs.Tab>
                <Tabs.Tab value="history">History</Tabs.Tab>
              </Tabs.List>
            </Tabs>
          </Group>
          <Group gap="sm" wrap="nowrap">
            <Text c="dimmed" fw={500} size="sm" visibleFrom="md">
              {appName}
            </Text>
            <Button variant="default" size="xs" leftSection={<IconRefresh size={14} />} onClick={() => void refresh()}>
              Refresh
            </Button>
            <Avatar color="indigo" radius="xl" size={30}>
              M
            </Avatar>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar>
        <ScrollArea style={{ height: "100%" }}>
          <Box p="sm">
            <Group justify="space-between" mb={6}>
              <Text fw={700} size="sm">
                Tables
              </Text>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label="New database"
                onClick={() => {
                  const n = window.prompt("New local database name", "scratch");
                  if (n) void createLocalDatabase(n);
                }}
              >
                <IconPlus size={15} />
              </ActionIcon>
            </Group>
            {tables.length === 0 && (
              <Text c="dimmed" size="xs" px={4}>
                No tables
              </Text>
            )}
            {tables.map((t) => (
              <NavLink
                key={t.name}
                active={editTable?.table === t.name}
                label={t.name}
                leftSection={<IconTable size={16} />}
                onClick={() => openTableData(t.name)}
                styles={{ root: { borderRadius: 8 } }}
              />
            ))}

            {newDetections.length > 0 && (
              <>
                <Text c="dimmed" size="xs" fw={600} mt="sm" mb={4} px={4} tt="uppercase">
                  Found locally
                </Text>
                {newDetections.map((d) => (
                  <Group key={d.id} justify="space-between" px={4} py={4} wrap="nowrap">
                    <Text size="sm" truncate>
                      {d.name}
                    </Text>
                    <Button size="compact-xs" variant="light" onClick={() => addDetected(d)}>
                      Add
                    </Button>
                  </Group>
                ))}
              </>
            )}

            <Divider my="sm" />
            <Group gap={6} mb={6}>
              <IconColumns size={15} />
              <Text fw={700} size="sm">
                Columns
              </Text>
            </Group>
            {cols.length === 0 && (
              <Text c="dimmed" size="xs" px={4}>
                Select a table
              </Text>
            )}
            {cols.map((c) => (
              <Group key={c.name} gap={8} px={4} py={5} wrap="nowrap">
                <Badge size="xs" variant="light" radius="sm" tt="none" color="gray">
                  {typeTag(c.dataType)}
                </Badge>
                <Text size="sm" style={{ flex: 1 }} truncate>
                  {c.name}
                </Text>
                {c.isPrimaryKey && <IconKey size={13} color="var(--mantine-color-indigo-6)" />}
              </Group>
            ))}
          </Box>
        </ScrollArea>
      </AppShell.Navbar>

      <AppShell.Main bg="gray.0">
        <Paper
          withBorder
          radius="md"
          style={{ height: "calc(100dvh - 88px)", display: "flex", flexDirection: "column", overflow: "hidden" }}
        >
          {tab === "data" && (
            <>
              {sheetHeader(tableName || "No table", (
                <>
                  <Button size="xs" variant="default" leftSection={<IconRefresh size={14} />} onClick={() => void refresh()}>
                    Refresh
                  </Button>
                  <FileButton onChange={onImportFile} accept=".csv,text/csv">
                    {(props) => (
                      <Button size="xs" variant="default" leftSection={<IconUpload size={14} />} {...props}>
                        Import
                      </Button>
                    )}
                  </FileButton>
                  <Button
                    size="xs"
                    variant="default"
                    leftSection={<IconDownload size={14} />}
                    disabled={!result}
                    onClick={() => result && download(`${tableName}.csv`, toCsv(result))}
                  >
                    Export
                  </Button>
                  <Button size="xs" variant="default" leftSection={<IconPlus size={14} />} onClick={addColumnPrompt}>
                    Column
                  </Button>
                  <Button
                    size="xs"
                    leftSection={<IconPlus size={14} />}
                    disabled={!result}
                    onClick={() => {
                      setAddDraft({});
                      setAddOpen(true);
                    }}
                  >
                    Row
                  </Button>
                </>
              ))}
              <Box style={{ flex: 1, minHeight: 0, overflow: "auto" }}>{dataTable}</Box>
            </>
          )}

          {tab === "sql" && (
            <>
              {sheetHeader("SQL query", (
                <Button
                  size="xs"
                  leftSection={<IconPlayerPlay size={14} />}
                  loading={sqlRunning}
                  disabled={!activeId}
                  onClick={runSql}
                >
                  Run
                </Button>
              ))}
              <Stack gap={0} style={{ flex: 1, minHeight: 0 }}>
                <Box p="sm">
                  <Textarea
                    value={sqlText}
                    onChange={(e) => setSqlText(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") void runSql();
                    }}
                    autosize
                    minRows={4}
                    maxRows={10}
                    spellCheck={false}
                    styles={{ input: { fontFamily: "var(--mantine-font-family-monospace)", fontSize: 13.5 } }}
                  />
                  {sqlError && (
                    <Text c="red.7" size="sm" mt="xs" ff="monospace">
                      {sqlError}
                    </Text>
                  )}
                </Box>
                <Divider />
                <Box style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
                  {sqlResult && sqlResult.columns.length > 0 ? (
                    <Table.ScrollContainer minWidth={560} type="native">
                      <Table highlightOnHover stickyHeader verticalSpacing="xs" horizontalSpacing="md">
                        <Table.Thead>
                          <Table.Tr>
                            {sqlResult.columns.map((c) => (
                              <Table.Th key={c.name}>{c.name}</Table.Th>
                            ))}
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {sqlResult.rows.map((r, ri) => (
                            <Table.Tr key={ri}>
                              {r.map((cell, ci) => (
                                <Table.Td key={ci}>
                                  {cell == null ? (
                                    <Text c="dimmed" fs="italic" size="sm">
                                      null
                                    </Text>
                                  ) : (
                                    String(cell)
                                  )}
                                </Table.Td>
                              ))}
                            </Table.Tr>
                          ))}
                        </Table.Tbody>
                      </Table>
                    </Table.ScrollContainer>
                  ) : (
                    <Center h={160}>
                      <Text c="dimmed">{sqlResult ? `${sqlResult.rowsAffected} row(s) affected` : "Run a query to see results"}</Text>
                    </Center>
                  )}
                </Box>
              </Stack>
            </>
          )}

          {tab === "structure" && (
            <>
              {sheetHeader(`Structure — ${tableName}`, (
                <Button size="xs" variant="default" leftSection={<IconPlus size={14} />} onClick={addColumnPrompt}>
                  Column
                </Button>
              ))}
              <Box style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
                <Table verticalSpacing="xs" horizontalSpacing="md" highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Column</Table.Th>
                      <Table.Th>Type</Table.Th>
                      <Table.Th>Nullable</Table.Th>
                      <Table.Th>Key</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {cols.map((c) => (
                      <Table.Tr key={c.name}>
                        <Table.Td fw={500}>{c.name}</Table.Td>
                        <Table.Td>
                          <Text ff="monospace" size="sm">
                            {c.dataType}
                          </Text>
                        </Table.Td>
                        <Table.Td>{c.nullable ? "YES" : "NO"}</Table.Td>
                        <Table.Td>{c.isPrimaryKey && <Badge variant="light" radius="sm">PRIMARY</Badge>}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
                {cols.length === 0 && (
                  <Center h={160}>
                    <Text c="dimmed">Select a table</Text>
                  </Center>
                )}
              </Box>
            </>
          )}

          {tab === "history" && (
            <>
              {sheetHeader("Query history", null)}
              <ScrollArea style={{ flex: 1, minHeight: 0 }}>
                <Stack gap="xs" p="sm">
                  {history.length === 0 && (
                    <Center h={140}>
                      <Text c="dimmed">No queries yet</Text>
                    </Center>
                  )}
                  {history.map((h) => (
                    <Paper
                      key={h.id}
                      withBorder
                      radius="md"
                      p="sm"
                      style={{ cursor: "pointer" }}
                      onClick={() => {
                        setSqlText(h.sql);
                        setTab("sql");
                      }}
                    >
                      <Text ff="monospace" size="sm" truncate>
                        {h.sql}
                      </Text>
                      <Text c="dimmed" size="xs" mt={2}>
                        {new Date(h.ranAt).toLocaleString()}
                      </Text>
                    </Paper>
                  ))}
                </Stack>
              </ScrollArea>
            </>
          )}
        </Paper>
      </AppShell.Main>

      <AppShell.Aside p="md">
        <ScrollArea style={{ height: "100%" }}>
          {inspectorRow != null && result && editTable ? (
            <RowForm
              key={inspectorRow}
              result={result}
              tableName={tableName}
              rowIndex={inspectorRow}
              pkIdx={pkIdx}
              samplesByCol={samplesByCol}
              onField={(ci, v) => editCell(inspectorRow, ci, v)}
              onDelete={() => {
                if (window.confirm("Delete this row?")) void deleteRowAt(inspectorRow);
              }}
              onClose={closeInspector}
            />
          ) : (
            <Stack gap="xs">
              <Group gap={8}>
                <IconTable size={17} />
                <Text fw={700}>{tableName || "No table"}</Text>
              </Group>
              <Text c="dimmed" size="xs" fw={600} tt="uppercase" mt="sm">
                Table
              </Text>
              {[
                ["Connection", appName],
                ["Rows loaded", String(result?.rows.length ?? 0)],
                ["Columns", String(cols.length)],
                ["Primary key", editTable?.pkColumn ?? "—"],
              ].map(([k, v]) => (
                <Group key={k} justify="space-between">
                  <Text size="sm" c="dimmed">
                    {k}
                  </Text>
                  <Text size="sm" fw={600}>
                    {v}
                  </Text>
                </Group>
              ))}
              <Text c="dimmed" size="xs" fw={600} tt="uppercase" mt="md">
                Actions
              </Text>
              <Button variant="default" justify="flex-start" leftSection={<IconRefresh size={16} />} onClick={() => void refresh()}>
                Refresh
              </Button>
              <Button
                variant="default"
                justify="flex-start"
                leftSection={<IconPencil size={16} />}
                disabled={!editTable}
                onClick={() => {
                  if (!editTable) return;
                  const n = window.prompt("Rename table to", editTable.table);
                  if (n?.trim() && n.trim() !== editTable.table) void renameTable(editTable.table, n.trim());
                }}
              >
                Rename table…
              </Button>
              <Button
                variant="light"
                color="red"
                justify="flex-start"
                leftSection={<IconTrash size={16} />}
                disabled={!editTable}
                onClick={() => {
                  if (!editTable) return;
                  if (window.confirm(`Drop table "${editTable.table}"? This permanently deletes it.`))
                    void dropTable(editTable.table);
                }}
              >
                Drop table…
              </Button>
              <Text c="dimmed" size="xs" mt="md">
                Tip: click any row to edit it as a form.
              </Text>
            </Stack>
          )}
        </ScrollArea>
      </AppShell.Aside>

      <Modal opened={addOpen} onClose={() => setAddOpen(false)} title={`Add row to ${tableName}`} centered>
        <Stack>
          {result?.columns.map((col, ci) => (
            <MantineField
              key={col.name}
              col={col}
              value={addDraft[col.name] ?? ""}
              samples={samplesByCol[ci] ?? []}
              disabled={false}
              onChange={(v) => setAddDraft((d) => ({ ...d, [col.name]: v }))}
            />
          ))}
          <Group justify="flex-end" mt="sm">
            <Button variant="default" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveAdd}>Add row</Button>
          </Group>
        </Stack>
      </Modal>
    </AppShell>
  );
}
