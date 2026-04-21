"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

interface MasterEndpoint {
  key: string;
  label: string;
  sourcePath: string;
  targetPath: string;
  syncTargetMode: "none" | "per-record" | "bulk";
  notes?: string;
}

interface TransactionEndpoint {
  key: string;
  label: string;
  sapServiceLayerPath: string;
  pendingHeaderSp?: string;
  pendingDetailSp?: string;
  detailParamName?: string;
  detailParamField?: string;
  notes?: string;
}

interface SyncEvent {
  id: string;
  timestamp: string;
  level: "info" | "warn" | "error";
  stage: string;
  message: string;
  details?: unknown;
}

interface SyncLogRecord {
  transactionId: string;
  key: string;
  status: "in-progress" | "success" | "failed";
  dryRun: boolean;
  query?: string;
  startedAt: string;
  endedAt?: string;
  sourcePath?: string;
  targetPath?: string;
  sourceCount?: number;
  postedCount?: number;
  skippedCount?: number;
  error?: string;
  events: SyncEvent[];
}

interface LocalDbTransaction {
  transactionId: string;
  key: string;
  status: string;
  dryRun: boolean;
  startedAt: string;
  endedAt: string | null;
  sourceCount: number | null;
  postedCount: number | null;
  skippedCount: number | null;
  errorMessage: string | null;
}

const ALL_MASTER_SYNC_KEY = "__all_master_sync__";
const ALL_TRANSACTION_SYNC_KEY = "__all_transaction_sync__";

const panelStyle: React.CSSProperties = {
  background: "#ffffffcc",
  border: "1px solid #dde4ef",
  borderRadius: 16,
  padding: 16,
  boxShadow: "0 8px 25px rgba(18, 43, 70, 0.08)",
};

const consoleControlGridStyle: React.CSSProperties = {
  display: "grid",
  gap: 14,
  gridTemplateColumns: "minmax(280px, 1.4fr) minmax(280px, 1fr)",
  alignItems: "start",
};

const fieldStackStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
};

const fieldLabelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "#274056",
};

const selectStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 40,
  borderRadius: 10,
  border: "1px solid #c6d3df",
  padding: "0 12px",
  background: "#fff",
  color: "#102a43",
};

const controlCardStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
  border: "1px solid #d8e2ec",
  borderRadius: 14,
  padding: 12,
  background: "linear-gradient(180deg, #fbfdff 0%, #f4f8fb 100%)",
};

const toggleGridStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
};

const toggleItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  minHeight: 44,
  border: "1px solid #d5e1ea",
  borderRadius: 12,
  padding: "10px 12px",
  background: "#fff",
  color: "#183b56",
};

const detailsCardStyle: React.CSSProperties = {
  marginTop: 14,
  display: "grid",
  gap: 10,
  border: "1px solid #d8e2ec",
  borderRadius: 14,
  padding: 14,
  background: "#f8fbfd",
  fontSize: 13,
  color: "#314256",
};

const metaGridStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
};

const metaItemStyle: React.CSSProperties = {
  display: "grid",
  gap: 4,
  minHeight: 74,
  alignContent: "start",
  padding: "10px 12px",
  border: "1px solid #d5e1ea",
  borderRadius: 12,
  background: "#fff",
};

const metaValueStyle: React.CSSProperties = {
  color: "#425466",
  lineHeight: 1.45,
  overflowWrap: "anywhere",
};

const actionRowStyle: React.CSSProperties = {
  marginTop: 14,
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
};

function extractLatestTransactionId(payloadText: string): string {
  try {
    const ids: string[] = [];
    const collectTransactionIds = (value: unknown) => {
      if (!value || typeof value !== "object") {
        return;
      }

      if (Array.isArray(value)) {
        value.forEach(collectTransactionIds);
        return;
      }

      const record = value as Record<string, unknown>;
      if (typeof record.transactionId === "string" && record.transactionId) {
        ids.push(record.transactionId);
      }

      Object.values(record).forEach(collectTransactionIds);
    };

    collectTransactionIds(JSON.parse(payloadText));
    return ids.at(-1) ?? "";
  } catch {
    return "";
  }
}

function parseResponsePayload(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

export function SyncDashboard() {
  const [endpoints, setEndpoints] = useState<MasterEndpoint[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>(ALL_MASTER_SYNC_KEY);
  const [transactionEndpoints, setTransactionEndpoints] = useState<TransactionEndpoint[]>([]);
  const [selectedTransactionKey, setSelectedTransactionKey] = useState<string>(ALL_TRANSACTION_SYNC_KEY);
  const [transactionContinueOnError, setTransactionContinueOnError] = useState<boolean>(true);
  const [transactionUsePendingFromLocalDb, setTransactionUsePendingFromLocalDb] =
    useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [responseText, setResponseText] = useState<string>("");
  const [logs, setLogs] = useState<SyncLogRecord[]>([]);
  const [activeTx, setActiveTx] = useState<string>("");
  const [activeTxDetails, setActiveTxDetails] = useState<SyncLogRecord | null>(null);
  const [localDbHealth, setLocalDbHealth] = useState<string>("not-checked");
  const [localDbTransactions, setLocalDbTransactions] = useState<LocalDbTransaction[]>([]);

  const activeEndpoint = useMemo(
    () => endpoints.find((item) => item.key === selectedKey) ?? null,
    [endpoints, selectedKey]
  );

  const isAllMasterSelected = selectedKey === ALL_MASTER_SYNC_KEY;
  const isAllTransactionSelected = selectedTransactionKey === ALL_TRANSACTION_SYNC_KEY;

  const activeTransactionEndpoint = useMemo(
    () => transactionEndpoints.find((item) => item.key === selectedTransactionKey) ?? null,
    [selectedTransactionKey, transactionEndpoints]
  );

  const masterSelectOptions = useMemo(
    () => [
      { key: ALL_MASTER_SYNC_KEY, label: "All Master Syncs" },
      ...endpoints.map((item) => ({ key: item.key, label: `${item.key} - ${item.label}` })),
    ],
    [endpoints]
  );

  const transactionSelectOptions = useMemo(
    () => [
      { key: ALL_TRANSACTION_SYNC_KEY, label: "All Transactions" },
      ...transactionEndpoints.map((item) => ({ key: item.key, label: `${item.key} - ${item.label}` })),
    ],
    [transactionEndpoints]
  );

  const loadEndpoints = useCallback(async () => {
    const res = await fetch("/api/master/endpoints");
    const json = (await res.json()) as { items: MasterEndpoint[] };
    setEndpoints(json.items ?? []);
    if (!selectedKey && json.items?.[0]?.key) {
      setSelectedKey(json.items[0].key);
    }
  }, [selectedKey]);

  const loadTransactionEndpoints = useCallback(async () => {
    const res = await fetch("/api/transactions/endpoints");
    const json = (await res.json()) as { items: TransactionEndpoint[] };
    setTransactionEndpoints(json.items ?? []);
    if (!selectedTransactionKey && json.items?.[0]?.key) {
      setSelectedTransactionKey(json.items[0].key);
    }
  }, [selectedTransactionKey]);

  const loadLogs = useCallback(async () => {
    const res = await fetch("/api/logs?limit=50", { cache: "no-store" });
    const json = (await res.json()) as { items: SyncLogRecord[] };
    setLogs(json.items ?? []);
  }, []);

  const loadTxDetails = useCallback(async (transactionId: string) => {
    if (!transactionId) {
      setActiveTxDetails(null);
      return;
    }

    const res = await fetch(`/api/logs?transactionId=${transactionId}`, { cache: "no-store" });
    const json = (await res.json()) as { item?: SyncLogRecord };
    setActiveTxDetails(json.item ?? null);
  }, []);

  const loadLocalDbStatus = useCallback(async () => {
    try {
      const healthRes = await fetch("/api/local-db/health", { cache: "no-store" });
      const healthJson = (await healthRes.json()) as { ok: boolean; message: string };
      setLocalDbHealth(healthJson.ok ? `connected: ${healthJson.message}` : `error: ${healthJson.message}`);

      if (!healthJson.ok) {
        setLocalDbTransactions([]);
        return;
      }

      const txRes = await fetch("/api/local-db/transactions?limit=10", { cache: "no-store" });
      const txJson = (await txRes.json()) as { items?: LocalDbTransaction[] };
      setLocalDbTransactions(txJson.items ?? []);
    } catch (error) {
      setLocalDbHealth(
        `error: ${error instanceof Error ? error.message : "unknown local db health error"}`
      );
      setLocalDbTransactions([]);
    }
  }, []);

  async function runSync() {
    setLoading(true);
    setResponseText("");

    try {
      if (isAllMasterSelected) {
        const res = await fetch("/api/master/jobs/full", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            dryRun: false,
            continueOnError: true,
          }),
        });

        const text = await res.text();
        setResponseText(JSON.stringify(parseResponsePayload(text), null, 2));

        const txId = extractLatestTransactionId(text);

        await loadLogs();
        await loadLocalDbStatus();

        if (txId) {
          setActiveTx(txId);
          await loadTxDetails(txId);
        }

        return;
      }

      if (!selectedKey) {
        return;
      }

      const res = await fetch(`/api/master/sync/${selectedKey}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dryRun: false,
        }),
      });

      const text = await res.text();
      setResponseText(text);

      const txId = extractLatestTransactionId(text);

      await loadLogs();
      await loadLocalDbStatus();

      if (txId) {
        setActiveTx(txId);
        await loadTxDetails(txId);
      }
    } catch (error) {
      setResponseText(
        JSON.stringify(
          {
            ok: false,
            error: error instanceof Error ? error.message : "Unknown sync request error",
          },
          null,
          2
        )
      );
      await loadLogs();
      await loadLocalDbStatus();
    } finally {
      setLoading(false);
    }
  }

  async function runTransactionPost() {
    setLoading(true);
    setResponseText("");

    try {
      const path = isAllTransactionSelected
        ? "/api/transactions/jobs/legacy-full"
        : `/api/transactions/post/${selectedTransactionKey}`;

      if (!isAllTransactionSelected && !selectedTransactionKey) {
        return;
      }

      const res = await fetch(path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dryRun: false,
          continueOnError: transactionContinueOnError,
          usePendingFromLocalDb: transactionUsePendingFromLocalDb,
        }),
      });

      const text = await res.text();
      setResponseText(JSON.stringify(parseResponsePayload(text), null, 2));

      const txId = extractLatestTransactionId(text);

      await loadLogs();
      await loadLocalDbStatus();

      if (txId) {
        setActiveTx(txId);
        await loadTxDetails(txId);
      }
    } catch (error) {
      setResponseText(
        JSON.stringify(
          {
            ok: false,
            error: error instanceof Error ? error.message : "Unknown transaction post request error",
          },
          null,
          2
        )
      );
      await loadLogs();
      await loadLocalDbStatus();
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadEndpoints();
    void loadTransactionEndpoints();
    void loadLogs();
    void loadLocalDbStatus();

    const timer = setInterval(() => {
      void loadLogs();
      void loadLocalDbStatus();
      if (activeTx) {
        void loadTxDetails(activeTx);
      }
    }, 4000);

    return () => clearInterval(timer);
  }, [activeTx, loadEndpoints, loadLocalDbStatus, loadLogs, loadTransactionEndpoints, loadTxDetails]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section style={panelStyle}>
        <h2 style={{ marginBottom: 10 }}>Master Data Sync Console</h2>

        <div style={{ display: "grid", gap: 12, maxWidth: 560 }}>
          <label style={fieldStackStyle}>
            <span style={fieldLabelStyle}>Master Sync Scope</span>
            <select style={selectStyle} value={selectedKey} onChange={(e) => setSelectedKey(e.target.value)}>
              {masterSelectOptions.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {activeEndpoint ? (
          <div style={detailsCardStyle}>
            <div style={{ fontWeight: 600, color: "#183b56" }}>Endpoint Details</div>
            <div style={metaGridStyle}>
              <div style={metaItemStyle}>
                <strong>Source</strong>
                <span style={metaValueStyle}>{activeEndpoint.sourcePath}</span>
              </div>
              <div style={metaItemStyle}>
                <strong>Target</strong>
                <span style={metaValueStyle}>{activeEndpoint.targetPath}</span>
              </div>
              <div style={metaItemStyle}>
                <strong>Mode</strong>
                <span style={metaValueStyle}>{activeEndpoint.syncTargetMode}</span>
              </div>
            </div>
          </div>
        ) : isAllMasterSelected ? (
          <div style={detailsCardStyle}>
            <div style={{ fontWeight: 600, color: "#183b56" }}>Full Master Sync</div>
            <div style={metaGridStyle}>
              <div style={metaItemStyle}>
                <strong>Sequence</strong>
                <span style={metaValueStyle}>Legacy core steps followed by currency steps</span>
              </div>
              <div style={metaItemStyle}>
                <strong>Includes</strong>
                <span style={metaValueStyle}>Items, warehouses, UOM group, currencies, currency rates, customer currencies</span>
              </div>
            </div>
          </div>
        ) : null}

        <div style={actionRowStyle}>
          <button
            onClick={runSync}
            disabled={loading || !selectedKey}
            style={{
              border: "none",
              borderRadius: 10,
              padding: "10px 16px",
              background: loading ? "#9aa8b6" : "#0d6f60",
              color: "white",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Sync Running..." : "Run Sync"}
          </button>
        </div>
      </section>

      <section style={panelStyle}>
        <h2 style={{ marginBottom: 10 }}>Transaction Posting Console</h2>
        <div style={consoleControlGridStyle}>
          <label style={fieldStackStyle}>
            <span style={fieldLabelStyle}>Transaction Scope</span>
            <select
              style={selectStyle}
              value={selectedTransactionKey}
              onChange={(e) => setSelectedTransactionKey(e.target.value)}
            >
              {transactionSelectOptions.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <div style={controlCardStyle}>
            <span style={fieldLabelStyle}>Execution Options</span>
            <div style={toggleGridStyle}>
              <label style={toggleItemStyle}>
                <input
                  type="checkbox"
                  style={{ marginTop: 2, accentColor: "#0d6f60" }}
                  checked={transactionContinueOnError}
                  onChange={(e) => setTransactionContinueOnError(e.target.checked)}
                />
                <span>Continue On Error</span>
              </label>

              <label style={toggleItemStyle}>
                <input
                  type="checkbox"
                  style={{ marginTop: 2, accentColor: "#0d6f60" }}
                  checked={transactionUsePendingFromLocalDb}
                  onChange={(e) => setTransactionUsePendingFromLocalDb(e.target.checked)}
                />
                <span>Use Pending Rows From Local DB</span>
              </label>
            </div>
          </div>
        </div>

        {activeTransactionEndpoint ? (
          <div style={detailsCardStyle}>
            <div style={{ fontWeight: 600, color: "#183b56" }}>Transaction Details</div>
            <div style={metaGridStyle}>
              <div style={metaItemStyle}>
                <strong>Record Scope</strong>
                <span style={metaValueStyle}>All available rows</span>
              </div>
              <div style={metaItemStyle}>
                <strong>Service Layer Target</strong>
                <span style={metaValueStyle}>{activeTransactionEndpoint.sapServiceLayerPath}</span>
              </div>
              <div style={metaItemStyle}>
                <strong>Pending Header SP</strong>
                <span style={metaValueStyle}>{activeTransactionEndpoint.pendingHeaderSp ?? "-"}</span>
              </div>
              <div style={metaItemStyle}>
                <strong>Pending Detail SP</strong>
                <span style={metaValueStyle}>{activeTransactionEndpoint.pendingDetailSp ?? "-"}</span>
              </div>
              {activeTransactionEndpoint.notes ? (
                <div style={{ ...metaItemStyle, gridColumn: "1 / -1" }}>
                  <strong>Notes</strong>
                  <span style={metaValueStyle}>{activeTransactionEndpoint.notes}</span>
                </div>
              ) : null}
            </div>
          </div>
        ) : isAllTransactionSelected ? (
          <div style={detailsCardStyle}>
            <div style={{ fontWeight: 600, color: "#183b56" }}>Full Transaction Job</div>
            <div style={metaGridStyle}>
              <div style={metaItemStyle}>
                <strong>Record Scope</strong>
                <span style={metaValueStyle}>All available rows</span>
              </div>
              <div style={metaItemStyle}>
                <strong>Execution Mode</strong>
                <span style={metaValueStyle}>Runs the legacy full transaction sequence</span>
              </div>
              <div style={metaItemStyle}>
                <strong>Source</strong>
                <span style={metaValueStyle}>
                  {transactionUsePendingFromLocalDb ? "Pending rows from local DB" : "Request payload mode"}
                </span>
              </div>
            </div>
          </div>
        ) : null}

        <div style={actionRowStyle}>
          <button
            onClick={runTransactionPost}
            disabled={loading || !selectedTransactionKey}
            style={{
              border: "none",
              borderRadius: 10,
              padding: "10px 16px",
              background: loading ? "#9aa8b6" : "#0d6f60",
              color: "white",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Transaction Running..." : "Run Transaction"}
          </button>
        </div>
      </section>

      <section style={panelStyle}>
        <h3 style={{ marginBottom: 8 }}>Latest API Response</h3>
        <pre style={{ fontSize: 12, overflowX: "auto", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
          {responseText || "Run a master sync or transaction post to see response payload and transaction id."}
        </pre>
      </section>

      <section style={panelStyle}>
        <h3 style={{ marginBottom: 8 }}>Transaction Logs</h3>
        <div style={{ display: "grid", gap: 8 }}>
          {logs.map((item) => (
            <button
              key={item.transactionId}
              onClick={() => {
                setActiveTx(item.transactionId);
                void loadTxDetails(item.transactionId);
              }}
              style={{
                textAlign: "left",
                border: activeTx === item.transactionId ? "1px solid #0d6f60" : "1px solid #d8dee7",
                background: "#fff",
                borderRadius: 10,
                padding: 10,
                cursor: "pointer",
              }}
            >
              <div style={{ fontWeight: 600 }}>
                {item.transactionId} [{item.status}] {item.key}
              </div>
              <div style={{ fontSize: 12, color: "#4e5f73" }}>
                source={item.sourceCount ?? 0}, posted={item.postedCount ?? 0}, skipped={item.skippedCount ?? 0}
              </div>
              {item.error ? <div style={{ color: "#b00020", fontSize: 12 }}>{item.error}</div> : null}
            </button>
          ))}

          {logs.length === 0 ? <div>No sync transactions yet.</div> : null}
        </div>
      </section>

      <section style={panelStyle}>
        <h3 style={{ marginBottom: 8 }}>Transaction Event Details</h3>
        {!activeTxDetails ? (
          <p>Select a transaction from logs to inspect stages and errors.</p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            <div>
              <strong>Transaction:</strong> {activeTxDetails.transactionId}
            </div>
            <div>
              <strong>Status:</strong> {activeTxDetails.status}
            </div>
            <div>
              <strong>Started:</strong> {activeTxDetails.startedAt}
            </div>
            <div>
              <strong>Ended:</strong> {activeTxDetails.endedAt ?? "-"}
            </div>

            <div style={{ marginTop: 6 }}>
              {activeTxDetails.events.map((event) => (
                <div
                  key={event.id}
                  style={{
                    border: "1px solid #e0e6ee",
                    borderRadius: 10,
                    padding: 10,
                    marginBottom: 8,
                    background: event.level === "error" ? "#fff2f2" : "#f8fbff",
                  }}
                >
                  <div style={{ fontSize: 12, color: "#4f6276" }}>
                    {event.timestamp} | {event.level} | {event.stage}
                  </div>
                  <div>{event.message}</div>
                  {event.details ? (
                    <pre style={{ fontSize: 12, marginTop: 8, whiteSpace: "pre-wrap" }}>
                      {JSON.stringify(event.details, null, 2)}
                    </pre>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section style={panelStyle}>
        <h3 style={{ marginBottom: 8 }}>Local Database Integration</h3>
        <div style={{ marginBottom: 8 }}>
          <strong>Health:</strong> {localDbHealth}
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          {localDbTransactions.map((item) => (
            <div
              key={item.transactionId}
              style={{ border: "1px solid #dfe7ef", borderRadius: 10, padding: 10, background: "#fff" }}
            >
              <div style={{ fontWeight: 600 }}>
                {item.transactionId} [{item.status}] {item.key}
              </div>
              <div style={{ fontSize: 12, color: "#4f6276" }}>
                source={item.sourceCount ?? 0}, posted={item.postedCount ?? 0}, skipped={item.skippedCount ?? 0}
              </div>
              {item.errorMessage ? (
                <div style={{ color: "#b00020", fontSize: 12 }}>{item.errorMessage}</div>
              ) : null}
            </div>
          ))}

          {localDbTransactions.length === 0 ? (
            <div style={{ fontSize: 13, color: "#4f6276" }}>
              No persisted DB transactions yet or local DB is disabled.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
