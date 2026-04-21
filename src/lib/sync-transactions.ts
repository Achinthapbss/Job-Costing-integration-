import { createSyncTransaction, closeSyncTransaction, logSyncEvent } from "@/lib/sync-logger";
import { getTransactionPostEnv } from "@/lib/env";
import { executeStoredProcedureOnLocalDb, isLocalDbEnabled } from "@/lib/local-db";
import { buildTransactionPayloads } from "@/lib/transaction-payload-builders";
import { getTransactionConfig, legacyTransactionSequence } from "@/lib/transaction-map";
import { requestSapServiceLayer } from "@/lib/sap-service-layer";
import { TransactionKey, TransactionRunOptions, TransactionRunResult } from "@/types/transaction";

export class TransactionExecutionError extends Error {
  public transactionId: string;

  constructor(message: string, transactionId: string) {
    super(message);
    this.name = "TransactionExecutionError";
    this.transactionId = transactionId;
  }
}

function buildDetailParam(
  key: TransactionKey,
  headerRow: Record<string, unknown>
): Array<{ name: string; value: unknown }> {
  const config = getTransactionConfig(key);
  if (!config || !config.detailParamName || !config.detailParamField) {
    return [];
  }

  return [
    {
      name: config.detailParamName,
      value: headerRow[config.detailParamField],
    },
  ];
}

function normalizeMaxRecords(maxRecords?: number): number | undefined {
  if (typeof maxRecords !== "number" || !Number.isFinite(maxRecords) || maxRecords < 1) {
    return undefined;
  }

  return Math.floor(maxRecords);
}

async function fetchPendingFromLocalDb(
  key: TransactionKey,
  maxRecords?: number
): Promise<unknown[]> {
  const config = getTransactionConfig(key);
  if (!config || !config.pendingHeaderSp) {
    return [];
  }

  if (!isLocalDbEnabled()) {
    throw new Error("LOCAL_DB_ENABLED must be true when usePendingFromLocalDb is requested");
  }

  const headers = await executeStoredProcedureOnLocalDb(config.pendingHeaderSp);
  const normalizedMaxRecords = normalizeMaxRecords(maxRecords);
  const selectedHeaders = normalizedMaxRecords ? headers.slice(0, normalizedMaxRecords) : headers;

  if (!config.pendingDetailSp) {
    return selectedHeaders;
  }

  const payloads: unknown[] = [];
  for (const row of selectedHeaders) {
    const detailParams = buildDetailParam(key, row);
    const details = await executeStoredProcedureOnLocalDb(config.pendingDetailSp, detailParams);
    if (details.length > 0) {
      payloads.push(...details);
    }
  }

  return payloads;
}

async function postOneTransaction(
  key: TransactionKey,
  payload: unknown,
  dryRun: boolean
): Promise<{ ok: boolean; error?: string }> {
  const config = getTransactionConfig(key);
  if (!config) {
    return { ok: false, error: `Unknown transaction key: ${key}` };
  }

  if (dryRun) {
    return { ok: true };
  }

  const response = await requestSapServiceLayer(config.sapServiceLayerPath, {
    method: "POST",
    body: JSON.stringify(payload),
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    return {
      ok: false,
      error: `SAP POST failed (${response.status}): ${body}`,
    };
  }

  return { ok: true };
}

function isRetryablePostError(error: string): boolean {
  return /SAP POST failed \((429|500|502|503|504)\)|fetch failed|ECONNRESET|ETIMEDOUT/i.test(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function postWithRetry(input: {
  key: TransactionKey;
  payload: unknown;
  dryRun: boolean;
  maxRetries: number;
  retryDelayMs: number;
  transactionId: string;
  index: number;
}): Promise<{ ok: boolean; error?: string }> {
  let attempt = 0;

  while (attempt <= input.maxRetries) {
    const result = await postOneTransaction(input.key, input.payload, input.dryRun);
    if (result.ok) {
      return result;
    }

    const err = result.error ?? "Unknown transaction post error";
    const shouldRetry = attempt < input.maxRetries && isRetryablePostError(err);
    if (!shouldRetry) {
      return { ok: false, error: err };
    }

    const waitMs = input.retryDelayMs * (attempt + 1);
    await logSyncEvent({
      transactionId: input.transactionId,
      level: "warn",
      stage: "post-retry",
      message: "Retrying failed SAP transaction post",
      details: {
        index: input.index,
        attempt: attempt + 1,
        waitMs,
        error: err,
      },
    });

    await sleep(waitMs);
    attempt += 1;
  }

  return { ok: false, error: "Retry loop ended unexpectedly" };
}

export async function runTransactionPosting(
  options: TransactionRunOptions
): Promise<TransactionRunResult> {
  const config = getTransactionConfig(options.key);
  const tx = await createSyncTransaction({
    key: `txn:${options.key}`,
    dryRun: options.dryRun ?? true,
    query: options.usePendingFromLocalDb ? "source=local-db" : "source=request",
  });

  if (!config) {
    await closeSyncTransaction({
      transactionId: tx.transactionId,
      status: "failed",
      error: `Unknown transaction key: ${options.key}`,
    });
    throw new TransactionExecutionError(`Unknown transaction key: ${options.key}`, tx.transactionId);
  }

  try {
    const dryRun = options.dryRun ?? true;
    const maxRecords = normalizeMaxRecords(options.maxRecords);
    const postEnv = getTransactionPostEnv();

    await logSyncEvent({
      transactionId: tx.transactionId,
      level: "info",
      stage: "transaction-start",
      message: "Transaction posting started",
      details: {
        key: options.key,
        dryRun,
        usePendingFromLocalDb: options.usePendingFromLocalDb ?? false,
        maxRecords: maxRecords ?? "unlimited",
        concurrency: postEnv.concurrency,
        maxRetries: postEnv.maxRetries,
        retryDelayMs: postEnv.retryDelayMs,
      },
    });

    const sourcePayloads = options.usePendingFromLocalDb
      ? await fetchPendingFromLocalDb(options.key, maxRecords)
      : options.payloads ?? [];

    const payloadBuild = buildTransactionPayloads(options.key, sourcePayloads);
    const payloads = maxRecords ? payloadBuild.payloads.slice(0, maxRecords) : payloadBuild.payloads;
    const errors: Array<{ index: number; message: string }> = [...payloadBuild.issues];

    await logSyncEvent({
      transactionId: tx.transactionId,
      level: payloadBuild.issues.length > 0 ? "warn" : "info",
      stage: "payload-build",
      message: "Transaction payload build completed",
      details: {
        key: options.key,
        sourceRows: sourcePayloads.length,
        documentsBuilt: payloads.length,
        buildIssues: payloadBuild.issues,
      },
    });

    let postedCount = 0;

    for (let i = 0; i < payloads.length; i += postEnv.concurrency) {
      const chunk = payloads.slice(i, i + postEnv.concurrency);
      const chunkResults = await Promise.all(
        chunk.map((payload, indexInChunk) =>
          postWithRetry({
            key: options.key,
            payload,
            dryRun,
            maxRetries: postEnv.maxRetries,
            retryDelayMs: postEnv.retryDelayMs,
            transactionId: tx.transactionId,
            index: i + indexInChunk,
          })
        )
      );

      let chunkHasFailure = false;
      chunkResults.forEach((result, indexInChunk) => {
        const absoluteIndex = i + indexInChunk;
        if (result.ok) {
          postedCount += 1;
          return;
        }

        chunkHasFailure = true;
        errors.push({ index: absoluteIndex, message: result.error ?? "Unknown transaction post error" });
      });

      if (chunkHasFailure && !(options.continueOnError ?? true)) {
        break;
      }
    }

    const failedCount = errors.length;
    const skippedCount = Math.max(0, payloads.length - postedCount - failedCount);

    const summary: TransactionRunResult = {
      transactionId: tx.transactionId,
      key: options.key,
      dryRun,
      sourceCount: payloads.length,
      postedCount,
      failedCount,
      skippedCount,
      source: options.usePendingFromLocalDb ? "local-db" : "request",
      errors,
    };

    await logSyncEvent({
      transactionId: tx.transactionId,
      level: failedCount > 0 ? "warn" : "info",
      stage: "transaction-summary",
      message: "Transaction posting completed",
      details: summary,
    });

    await closeSyncTransaction({
      transactionId: tx.transactionId,
      status: failedCount > 0 ? "failed" : "success",
      sourcePath: config.pendingHeaderSp ?? config.sapServiceLayerPath,
      targetPath: config.sapServiceLayerPath,
      sourceCount: payloads.length,
      postedCount,
      skippedCount: failedCount + skippedCount,
      error: failedCount > 0 ? `Failed rows: ${failedCount}` : undefined,
    });

    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown transaction execution error";

    await logSyncEvent({
      transactionId: tx.transactionId,
      level: "error",
      stage: "transaction-error",
      message: "Transaction posting failed",
      details: { error: message },
    });

    await closeSyncTransaction({
      transactionId: tx.transactionId,
      status: "failed",
      error: message,
    });

    throw new TransactionExecutionError(message, tx.transactionId);
  }
}

export async function runLegacyFullTransactionJob(input: {
  dryRun: boolean;
  continueOnError: boolean;
  usePendingFromLocalDb: boolean;
  maxRecords?: number;
}): Promise<{
  ok: boolean;
  startedAt: string;
  endedAt: string;
  steps: Array<{
    key: TransactionKey;
    ok: boolean;
    transactionId?: string;
    result?: TransactionRunResult;
    error?: string;
  }>;
}> {
  const startedAt = new Date().toISOString();
  const steps: Array<{
    key: TransactionKey;
    ok: boolean;
    transactionId?: string;
    result?: TransactionRunResult;
    error?: string;
  }> = [];

  for (const key of legacyTransactionSequence) {
    try {
      const result = await runTransactionPosting({
        key,
        dryRun: input.dryRun,
        continueOnError: input.continueOnError,
        usePendingFromLocalDb: input.usePendingFromLocalDb,
        maxRecords: input.maxRecords,
      });

      steps.push({
        key,
        ok: result.failedCount === 0,
        transactionId: result.transactionId,
        result,
      });
    } catch (error) {
      const transactionId = error instanceof TransactionExecutionError ? error.transactionId : undefined;
      const message = error instanceof Error ? error.message : "Unknown legacy transaction job error";
      steps.push({
        key,
        ok: false,
        transactionId,
        error: message,
      });

      if (!input.continueOnError) {
        break;
      }
    }
  }

  return {
    ok: steps.every((step) => step.ok),
    startedAt,
    endedAt: new Date().toISOString(),
    steps,
  };
}
