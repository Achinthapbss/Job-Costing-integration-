import { getMasterPostEnv, getTargetEnv, getValidationEnv } from "@/lib/env";
import {
  insertMasterDataRawBatch,
  isLocalDbMasterDataWriteEnabled,
  syncCustomerToLegacyTable,
  syncCurrencyMasterToLegacyTable,
  syncCurrencyRatesToLegacyTable,
  syncCustomerCurrencyToLegacyTable,
  syncItemWarehousesToLegacyTable,
  syncPeriodsToLegacyTable,
  syncTaxCodesToLegacyTable,
  syncUomToLegacyTable,
  syncWarehouseMasterToLegacyTable,
} from "@/lib/local-db";
import { getMasterDataConfig } from "@/lib/master-data-map";
import { buildMasterSapPayload } from "@/lib/master-sap-payload-builders";
import { validateMasterRecords } from "@/lib/master-validation";
import { getSapList, requestSapServiceLayer } from "@/lib/sap-service-layer";
import { closeSyncTransaction, createSyncTransaction, logSyncEvent } from "@/lib/sync-logger";
import {
  isCurrencyMasterKey,
  isCurrencyRatesKey,
  isCustomerCurrencyKey,
} from "@/lib/currency-master";
import { isCustomerMasterKey } from "@/lib/customer-master";
import { isItemWarehousesKey } from "@/lib/item-warehouse-master";
import { isPeriodsKey } from "@/lib/period-master";
import { isTaxCodesKey } from "@/lib/tax-master";
import { isUomMasterKey } from "@/lib/uom-master";
import { isWarehouseMasterKey } from "@/lib/warehouse-master";
import { SyncMasterDataOptions, SyncMasterDataResult } from "@/types/master-data";

export class SyncExecutionError extends Error {
  public transactionId: string;

  constructor(message: string, transactionId: string) {
    super(message);
    this.name = "SyncExecutionError";
    this.transactionId = transactionId;
  }
}

async function postToTarget(path: string, payload: unknown): Promise<void> {
  const targetEnv = getTargetEnv();

  if (!targetEnv.targetSystemBaseUrl) {
    return;
  }

  const response = await fetch(`${targetEnv.targetSystemBaseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(targetEnv.targetSystemApiKey
        ? { "x-api-key": targetEnv.targetSystemApiKey }
        : {}),
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Target system POST failed (${response.status}) ${path}: ${body}`);
  }
}

function formatSapEntityKey(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  const escaped = String(value).replace(/'/g, "''");
  return `'${escaped}'`;
}

function isDuplicateSapError(status: number, body: string): boolean {
  if (status === 409) {
    return true;
  }

  if (status >= 400 && status < 500) {
    return /-2035|already exists|duplicate/i.test(body);
  }

  return false;
}

async function postOrPatchSap(path: string, payload: Record<string, unknown>, upsertKeyField?: string) {
  const postResponse = await requestSapServiceLayer(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (postResponse.ok) {
    return;
  }

  const postBody = await postResponse.text();
  if (!upsertKeyField || !isDuplicateSapError(postResponse.status, postBody)) {
    throw new Error(`SAP Service Layer POST failed (${postResponse.status}) ${path}: ${postBody}`);
  }

  const keyValue = payload[upsertKeyField];
  if (keyValue === undefined || keyValue === null || keyValue === "") {
    throw new Error(
      `SAP upsert key field '${upsertKeyField}' missing in payload for duplicate handling on ${path}`
    );
  }

  const patchPath = `${path}(${formatSapEntityKey(keyValue)})`;
  const patchResponse = await requestSapServiceLayer(patchPath, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!patchResponse.ok) {
    const patchBody = await patchResponse.text();
    throw new Error(`SAP Service Layer PATCH failed (${patchResponse.status}) ${patchPath}: ${patchBody}`);
  }
}

export async function syncMasterData(
  options: SyncMasterDataOptions
): Promise<SyncMasterDataResult> {
  const transaction = await createSyncTransaction({
    key: options.key,
    dryRun: options.dryRun ?? false,
    query: options.query,
    targetOverridePath: options.targetOverridePath,
  });

  const config = getMasterDataConfig(options.key);
  if (!config) {
    await closeSyncTransaction({
      transactionId: transaction.transactionId,
      status: "failed",
      error: `Unknown master data key: ${options.key}`,
    });
    throw new SyncExecutionError(`Unknown master data key: ${options.key}`, transaction.transactionId);
  }

  try {
    const sourcePath = options.query ? `${config.sourcePath}${options.query}` : config.sourcePath;
    const targetPath = options.targetOverridePath ?? config.targetPath;
    const dryRun = options.dryRun ?? false;
    const targetEnv = getTargetEnv();
    const masterPostEnv = getMasterPostEnv();
    const validationEnv = getValidationEnv();
    const postDestination: "target" | "sap" =
      masterPostEnv.postToSapEnabled && !!config.sapPostPath ? "sap" : "target";
    const effectivePostPath = postDestination === "sap" ? config.sapPostPath ?? targetPath : targetPath;

    await logSyncEvent({
      transactionId: transaction.transactionId,
      level: "info",
      stage: "source-fetch",
      message: "Fetching records from SAP Service Layer",
      details: { sourcePath },
    });

    const records = await getSapList(sourcePath);

    await logSyncEvent({
      transactionId: transaction.transactionId,
      level: "info",
      stage: "source-fetch",
      message: "Records fetched successfully",
      details: { sourceCount: records.length },
    });

    let recordsToProcess = records;
    let validCount = records.length;
    let invalidCount = 0;
    let validationErrors: Array<{ index: number; missingFields: string[] }> = [];

    if (validationEnv.enabled) {
      const validation = validateMasterRecords(
        config.key,
        records,
        Math.max(1, validationEnv.maxErrors)
      );

      validCount = validation.validCount;
      invalidCount = validation.invalidCount;
      validationErrors = validation.issues.map((issue) => ({
        index: issue.index,
        missingFields: issue.missingFields,
      }));

      await logSyncEvent({
        transactionId: transaction.transactionId,
        level: invalidCount > 0 ? "warn" : "info",
        stage: "payload-validation",
        message: "Master payload validation completed",
        details: {
          totalCount: validation.totalCount,
          validCount,
          invalidCount,
          strictMode: validationEnv.strict,
          sampleErrors: validationErrors,
        },
      });

      if (invalidCount > 0 && validationEnv.strict) {
        throw new Error(
          `Validation failed for key ${config.key}: ${invalidCount} invalid record(s). See transaction logs for details.`
        );
      }

      recordsToProcess = validation.validRecords;
    }

    if (dryRun) {
      await logSyncEvent({
        transactionId: transaction.transactionId,
        level: "warn",
        stage: "local-db-save",
        message: "Skipped saving SAP records to local DB because dryRun is true",
      });
    } else if (isLocalDbMasterDataWriteEnabled()) {
      const savedCount = await insertMasterDataRawBatch({
        transactionId: transaction.transactionId,
        key: config.key,
        sourcePath,
        records: recordsToProcess,
      });

      await logSyncEvent({
        transactionId: transaction.transactionId,
        level: "info",
        stage: "local-db-save",
        message: "Saved SAP master records to local DB",
        details: { savedCount, key: config.key, invalidCount },
      });

      if (isWarehouseMasterKey(config.key)) {
        if (recordsToProcess.length === 0) {
          await logSyncEvent({
            transactionId: transaction.transactionId,
            level: "warn",
            stage: "local-db-warehouse-sync",
            message: "Skipped legacy tblWhseMst sync because there were no warehouse records to apply",
          });
        } else {
          const warehouseSync = await syncWarehouseMasterToLegacyTable({
            records: recordsToProcess,
          });

          await logSyncEvent({
            transactionId: transaction.transactionId,
            level: warehouseSync.applied ? "info" : "warn",
            stage: "local-db-warehouse-sync",
            message: warehouseSync.applied
              ? "Synchronized warehouse master records to legacy tblWhseMst"
              : "Skipped legacy tblWhseMst synchronization",
            details: warehouseSync,
          });
        }
      }

      if (isCustomerMasterKey(config.key)) {
        if (recordsToProcess.length === 0) {
          await logSyncEvent({
            transactionId: transaction.transactionId,
            level: "warn",
            stage: "local-db-customer-sync",
            message: "Skipped legacy tblRefCustomer sync because there were no customer records to apply",
          });
        } else {
          const customerSync = await syncCustomerToLegacyTable({
            records: recordsToProcess,
          });

          await logSyncEvent({
            transactionId: transaction.transactionId,
            level: customerSync.applied ? "info" : "warn",
            stage: "local-db-customer-sync",
            message: customerSync.applied
              ? "Synchronized customer records to legacy tblRefCustomer"
              : "Skipped legacy tblRefCustomer synchronization",
            details: customerSync,
          });
        }
      }

      if (isCurrencyMasterKey(config.key)) {
        if (recordsToProcess.length === 0) {
          await logSyncEvent({
            transactionId: transaction.transactionId,
            level: "warn",
            stage: "local-db-currency-sync",
            message: "Skipped legacy tblRefCurrency sync because there were no currency records to apply",
          });
        } else {
          const currencySync = await syncCurrencyMasterToLegacyTable({
            records: recordsToProcess,
          });

          await logSyncEvent({
            transactionId: transaction.transactionId,
            level: currencySync.applied ? "info" : "warn",
            stage: "local-db-currency-sync",
            message: currencySync.applied
              ? "Synchronized currency records to legacy tblRefCurrency"
              : "Skipped legacy tblRefCurrency synchronization",
            details: currencySync,
          });
        }
      }

      if (isCurrencyRatesKey(config.key)) {
        if (recordsToProcess.length === 0) {
          await logSyncEvent({
            transactionId: transaction.transactionId,
            level: "warn",
            stage: "local-db-currency-rate-sync",
            message: "Skipped legacy tblRefCurrencyRate sync because there were no currency-rate records to apply",
          });
        } else {
          const currencyRateSync = await syncCurrencyRatesToLegacyTable({
            records: recordsToProcess,
          });

          await logSyncEvent({
            transactionId: transaction.transactionId,
            level: currencyRateSync.applied ? "info" : "warn",
            stage: "local-db-currency-rate-sync",
            message: currencyRateSync.applied
              ? "Synchronized currency-rate records to legacy tblRefCurrencyRate"
              : "Skipped legacy tblRefCurrencyRate synchronization",
            details: currencyRateSync,
          });
        }
      }

      if (isCustomerCurrencyKey(config.key)) {
        if (recordsToProcess.length === 0) {
          await logSyncEvent({
            transactionId: transaction.transactionId,
            level: "warn",
            stage: "local-db-customer-currency-sync",
            message: "Skipped legacy tblRefCustomer_Currency sync because there were no customer-currency records to apply",
          });
        } else {
          const customerCurrencySync = await syncCustomerCurrencyToLegacyTable({
            records: recordsToProcess,
          });

          await logSyncEvent({
            transactionId: transaction.transactionId,
            level: customerCurrencySync.applied ? "info" : "warn",
            stage: "local-db-customer-currency-sync",
            message: customerCurrencySync.applied
              ? "Synchronized customer-currency records to legacy tblRefCustomer_Currency"
              : "Skipped legacy tblRefCustomer_Currency synchronization",
            details: customerCurrencySync,
          });
        }
      }

      if (isUomMasterKey(config.key)) {
        if (recordsToProcess.length === 0) {
          await logSyncEvent({
            transactionId: transaction.transactionId,
            level: "warn",
            stage: "local-db-uom-sync",
            message: "Skipped legacy tblRefUnits sync because there were no UOM records to apply",
          });
        } else {
          const uomSync = await syncUomToLegacyTable({
            records: recordsToProcess,
          });

          await logSyncEvent({
            transactionId: transaction.transactionId,
            level: uomSync.applied ? "info" : "warn",
            stage: "local-db-uom-sync",
            message: uomSync.applied
              ? "Synchronized UOM records to legacy tblRefUnits"
              : "Skipped legacy tblRefUnits synchronization",
            details: uomSync,
          });
        }
      }

      if (isItemWarehousesKey(config.key)) {
        if (recordsToProcess.length === 0) {
          await logSyncEvent({
            transactionId: transaction.transactionId,
            level: "warn",
            stage: "local-db-item-warehouse-sync",
            message: "Skipped legacy tblRefItem_WH sync because there were no item-warehouse records to apply",
          });
        } else {
          const itemWarehouseSync = await syncItemWarehousesToLegacyTable({
            records: recordsToProcess,
          });

          await logSyncEvent({
            transactionId: transaction.transactionId,
            level: itemWarehouseSync.applied ? "info" : "warn",
            stage: "local-db-item-warehouse-sync",
            message: itemWarehouseSync.applied
              ? "Synchronized item-warehouse records to legacy tblRefItem_WH"
              : "Skipped legacy tblRefItem_WH synchronization",
            details: itemWarehouseSync,
          });
        }
      }

      if (isTaxCodesKey(config.key)) {
        if (recordsToProcess.length === 0) {
          await logSyncEvent({
            transactionId: transaction.transactionId,
            level: "warn",
            stage: "local-db-tax-sync",
            message: "Skipped legacy tblRefVATCodes sync because there were no tax-code records to apply",
          });
        } else {
          const taxSync = await syncTaxCodesToLegacyTable({
            records: recordsToProcess,
          });

          await logSyncEvent({
            transactionId: transaction.transactionId,
            level: taxSync.applied ? "info" : "warn",
            stage: "local-db-tax-sync",
            message: taxSync.applied
              ? "Synchronized tax-code records to legacy tblRefVATCodes"
              : "Skipped legacy tblRefVATCodes synchronization",
            details: taxSync,
          });
        }
      }

      if (isPeriodsKey(config.key)) {
        if (recordsToProcess.length === 0) {
          await logSyncEvent({
            transactionId: transaction.transactionId,
            level: "warn",
            stage: "local-db-periods-sync",
            message: "Skipped legacy tblRefPeriods sync because there were no period records to apply",
          });
        } else {
          const periodsSync = await syncPeriodsToLegacyTable({
            records: recordsToProcess,
          });

          await logSyncEvent({
            transactionId: transaction.transactionId,
            level: periodsSync.applied ? "info" : "warn",
            stage: "local-db-periods-sync",
            message: periodsSync.applied
              ? "Synchronized periods to legacy tblRefPeriods"
              : "Skipped legacy tblRefPeriods synchronization",
            details: periodsSync,
          });
        }
      }
    } else {
      await logSyncEvent({
        transactionId: transaction.transactionId,
        level: "warn",
        stage: "local-db-save",
        message: "Local DB master-data persistence is disabled",
      });
    }

    if (
      dryRun ||
      config.syncTargetMode === "none" ||
      (postDestination === "target" && !targetEnv.targetSystemBaseUrl)
    ) {
      await logSyncEvent({
        transactionId: transaction.transactionId,
        level: "warn",
        stage: "sync-skip",
        message: "Sync executed in skip mode",
        details: {
          dryRun,
          noTargetConfigured: !targetEnv.targetSystemBaseUrl,
          destination: postDestination,
          mode: config.syncTargetMode,
        },
      });

      const result: SyncMasterDataResult = {
        transactionId: transaction.transactionId,
        key: config.key,
        sourcePath,
        sourceCount: records.length,
        validCount,
        invalidCount,
        validationErrors,
        postedCount: 0,
        skippedCount: records.length,
        dryRun,
        targetPath: effectivePostPath,
      };

      await closeSyncTransaction({
        transactionId: transaction.transactionId,
        status: "success",
        sourcePath,
        targetPath: effectivePostPath,
        sourceCount: records.length,
        postedCount: 0,
        skippedCount: records.length,
      });

      return result;
    }

    if (config.syncTargetMode === "bulk" && postDestination === "target") {
      await logSyncEvent({
        transactionId: transaction.transactionId,
        level: "info",
        stage: "target-post",
        message: "Posting records in bulk mode",
        details: {
          targetPath: effectivePostPath,
          sourceCount: recordsToProcess.length,
          invalidCount,
          destination: postDestination,
        },
      });

      await postToTarget(effectivePostPath, {
        key: config.key,
        items: recordsToProcess,
        count: recordsToProcess.length,
      });

      const result: SyncMasterDataResult = {
        transactionId: transaction.transactionId,
        key: config.key,
        sourcePath,
        sourceCount: records.length,
        validCount,
        invalidCount,
        validationErrors,
        postedCount: recordsToProcess.length,
        skippedCount: invalidCount,
        dryRun,
        targetPath: effectivePostPath,
      };

      await closeSyncTransaction({
        transactionId: transaction.transactionId,
        status: "success",
        sourcePath,
        targetPath: effectivePostPath,
        sourceCount: records.length,
        postedCount: recordsToProcess.length,
        skippedCount: invalidCount,
      });

      return result;
    }

    let postedCount = 0;
    for (const item of recordsToProcess) {
      if (postDestination === "sap") {
        const payload = buildMasterSapPayload(config.key, item) as Record<string, unknown>;
        await postOrPatchSap(effectivePostPath, payload, config.sapUpsertKeyField);
      } else {
        await postToTarget(effectivePostPath, item);
      }
      postedCount += 1;
    }

    await logSyncEvent({
      transactionId: transaction.transactionId,
      level: "info",
      stage: "target-post",
      message: "Records posted in per-record mode",
      details: { postedCount, targetPath: effectivePostPath, destination: postDestination },
    });

    const result: SyncMasterDataResult = {
      transactionId: transaction.transactionId,
      key: config.key,
      sourcePath,
      sourceCount: records.length,
      validCount,
      invalidCount,
      validationErrors,
      postedCount,
      skippedCount: invalidCount,
      dryRun,
      targetPath: effectivePostPath,
    };

    await closeSyncTransaction({
      transactionId: transaction.transactionId,
      status: "success",
      sourcePath,
      targetPath: effectivePostPath,
      sourceCount: records.length,
      postedCount,
      skippedCount: invalidCount,
    });

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync error";

    await logSyncEvent({
      transactionId: transaction.transactionId,
      level: "error",
      stage: "sync-error",
      message: "Sync failed",
      details: { error: message },
    });

    await closeSyncTransaction({
      transactionId: transaction.transactionId,
      status: "failed",
      error: message,
    });

    throw new SyncExecutionError(message, transaction.transactionId);
  }
}
