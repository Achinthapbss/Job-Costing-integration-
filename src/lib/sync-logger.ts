import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

import { insertSyncEventDb, upsertSyncTransactionDb } from "@/lib/local-db";
import { SyncLogLevel, SyncTransactionEvent, SyncTransactionRecord, SyncTransactionStatus } from "@/types/logging";

const transactions = new Map<string, SyncTransactionRecord>();

function makeId(prefix: string): string {
  return `${prefix}-${crypto.randomBytes(6).toString("hex")}`;
}

function logsFilePath(): string {
  return path.join(process.cwd(), "logs", "sync-transaction-log.jsonl");
}

async function persistLogLine(payload: unknown): Promise<void> {
  const filePath = logsFilePath();
  const dirPath = path.dirname(filePath);
  await mkdir(dirPath, { recursive: true });
  await appendFile(filePath, `${JSON.stringify(payload)}\n`, "utf8");
}

export async function createSyncTransaction(input: {
  key: string;
  dryRun: boolean;
  query?: string;
  targetOverridePath?: string;
}): Promise<SyncTransactionRecord> {
  const now = new Date().toISOString();
  const transactionId = makeId("tx");

  const record: SyncTransactionRecord = {
    transactionId,
    key: input.key,
    dryRun: input.dryRun,
    query: input.query,
    targetOverridePath: input.targetOverridePath,
    status: "in-progress",
    startedAt: now,
    events: [],
  };

  transactions.set(transactionId, record);

  await persistLogLine({
    type: "transaction-start",
    transactionId,
    key: input.key,
    dryRun: input.dryRun,
    query: input.query,
    targetOverridePath: input.targetOverridePath,
    timestamp: now,
  });

  await upsertSyncTransactionDb({
    transactionId,
    key: input.key,
    dryRun: input.dryRun,
    status: "in-progress",
    query: input.query,
    targetOverridePath: input.targetOverridePath,
    startedAt: now,
  });

  return record;
}

export async function logSyncEvent(input: {
  transactionId: string;
  level: SyncLogLevel;
  stage: string;
  message: string;
  details?: unknown;
}): Promise<void> {
  const transaction = transactions.get(input.transactionId);
  if (!transaction) {
    return;
  }

  const event: SyncTransactionEvent = {
    id: makeId("ev"),
    transactionId: input.transactionId,
    timestamp: new Date().toISOString(),
    level: input.level,
    stage: input.stage,
    message: input.message,
    details: input.details,
  };

  transaction.events.unshift(event);

  await persistLogLine({
    type: "event",
    ...event,
  });

  await insertSyncEventDb({
    eventId: event.id,
    transactionId: event.transactionId,
    timestamp: event.timestamp,
    level: event.level,
    stage: event.stage,
    message: event.message,
    details: event.details,
  });
}

export async function closeSyncTransaction(input: {
  transactionId: string;
  status: SyncTransactionStatus;
  sourcePath?: string;
  targetPath?: string;
  sourceCount?: number;
  postedCount?: number;
  skippedCount?: number;
  error?: string;
}): Promise<void> {
  const transaction = transactions.get(input.transactionId);
  if (!transaction) {
    return;
  }

  transaction.status = input.status;
  transaction.endedAt = new Date().toISOString();
  transaction.sourcePath = input.sourcePath;
  transaction.targetPath = input.targetPath;
  transaction.sourceCount = input.sourceCount;
  transaction.postedCount = input.postedCount;
  transaction.skippedCount = input.skippedCount;
  transaction.error = input.error;

  await persistLogLine({
    type: "transaction-end",
    transactionId: input.transactionId,
    status: input.status,
    sourcePath: input.sourcePath,
    targetPath: input.targetPath,
    sourceCount: input.sourceCount,
    postedCount: input.postedCount,
    skippedCount: input.skippedCount,
    error: input.error,
    endedAt: transaction.endedAt,
  });

  await upsertSyncTransactionDb({
    transactionId: transaction.transactionId,
    key: transaction.key,
    dryRun: transaction.dryRun,
    status: transaction.status,
    query: transaction.query,
    targetOverridePath: transaction.targetOverridePath,
    sourcePath: transaction.sourcePath,
    targetPath: transaction.targetPath,
    sourceCount: transaction.sourceCount,
    postedCount: transaction.postedCount,
    skippedCount: transaction.skippedCount,
    error: transaction.error,
    startedAt: transaction.startedAt,
    endedAt: transaction.endedAt,
  });
}

export function getSyncTransactions(limit = 20): SyncTransactionRecord[] {
  return [...transactions.values()]
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
    .slice(0, limit);
}

export function getSyncTransaction(transactionId: string): SyncTransactionRecord | null {
  return transactions.get(transactionId) ?? null;
}
