import sql, { config as SqlConfig } from "mssql";

import { AccountLegacyRow, mapAccountLegacyRow } from "@/lib/account-master";
import { BankLegacyRow, mapBankLegacyRow } from "@/lib/bank-master";
import { BranchLegacyRow, mapBranchLegacyRow } from "@/lib/branch-master";
import {
  CurrencyLegacyRow,
  CurrencyRateLegacyRow,
  CustomerCurrencyLegacyRow,
  mapCurrencyLegacyRow,
  mapCurrencyRateLegacyRow,
  mapCustomerCurrencyLegacyRow,
} from "@/lib/currency-master";
import { CustomerLegacyRow, mapCustomerLegacyRow } from "@/lib/customer-master";
import {
  DistributionRuleLegacyRow,
  mapDistributionRuleLegacyRow,
} from "@/lib/distribution-rule-master";
import {
  countItemWarehouseCandidates,
  ItemWarehouseLegacyRow,
  mapItemWarehouseLegacyRows,
} from "@/lib/item-warehouse-master";
import { ItemLegacyRow, mapItemLegacyRow } from "@/lib/item-master";
import { LoginUserLegacyRow, mapLoginUserLegacyRow } from "@/lib/login-user-master";
import { mapPriceListLegacyRows, PriceListLegacyRow } from "@/lib/price-list-master";
import { mapProjectLegacyRow, ProjectLegacyRow } from "@/lib/project-master";
import { mapSerialNumberLegacyRow, SerialNumberLegacyRow } from "@/lib/serial-number-master";
import { mapPeriodLegacyRow, PeriodLegacyRow } from "@/lib/period-master";
import { mapSalesRepLegacyRow, SalesRepLegacyRow } from "@/lib/sales-rep-master";
import { mapTaxCodeLegacyRow, TaxCodeLegacyRow } from "@/lib/tax-master";
import {
  mapUomConversionLegacyRows,
  UomConversionLegacyRow,
  UomFormulaLegacyRow,
} from "@/lib/uom-conversion-master";
import { mapUomGroupLegacyRow, UomGroupLegacyRow } from "@/lib/uom-group-master";
import { mapUomLegacyRow, UomLegacyRow } from "@/lib/uom-master";
import { mapWarehouseMasterLegacyRow, WarehouseMasterLegacyRow } from "@/lib/warehouse-master";
import { mapVendorLegacyRow, VendorLegacyRow } from "@/lib/vendor-master";

interface LocalDbEnv {
  enabled: boolean;
  writeMasterData: boolean;
  server: string;
  database: string;
  user: string;
  password: string;
  encrypt: boolean;
  trustServerCertificate: boolean;
}

export interface WarehouseMasterLegacySyncResult {
  applied: boolean;
  processedCount: number;
  skippedCount: number;
  reason?: string;
}

export interface UomLegacySyncResult {
  applied: boolean;
  processedCount: number;
  skippedCount: number;
  reason?: string;
}

export interface CurrencyLegacySyncResult {
  applied: boolean;
  processedCount: number;
  skippedCount: number;
  executionMode?: "stored-procedure" | "direct-sql";
  reason?: string;
}

export interface VendorLegacySyncResult {
  applied: boolean;
  processedCount: number;
  skippedCount: number;
  executionMode?: "stored-procedure" | "direct-sql";
  reason?: string;
}

export interface SalesRepLegacySyncResult {
  applied: boolean;
  processedCount: number;
  skippedCount: number;
  executionMode?: "stored-procedure" | "direct-sql";
  reason?: string;
}

export interface LoginUsersLegacySyncResult {
  applied: boolean;
  processedCount: number;
  skippedCount: number;
  executionMode?: "stored-procedure" | "direct-sql";
  reason?: string;
}

export interface DistributionRuleLegacySyncResult {
  applied: boolean;
  processedCount: number;
  skippedCount: number;
  executionMode?: "stored-procedure" | "direct-sql";
  reason?: string;
}

export interface CustomerLegacySyncResult {
  applied: boolean;
  processedCount: number;
  skippedCount: number;
  executionMode?: "stored-procedure" | "direct-sql";
  reason?: string;
}

export interface AccountsLegacySyncResult {
  applied: boolean;
  processedCount: number;
  skippedCount: number;
  executionMode?: "stored-procedure" | "direct-sql";
  reason?: string;
}

export interface TaxLegacySyncResult {
  applied: boolean;
  processedCount: number;
  skippedCount: number;
  executionMode?: "stored-procedure" | "direct-sql";
  reason?: string;
}

export interface PeriodLegacySyncResult {
  applied: boolean;
  processedCount: number;
  skippedCount: number;
  executionMode?: "stored-procedure" | "direct-sql";
  reason?: string;
}

export interface ItemWarehouseLegacySyncResult {
  applied: boolean;
  processedCount: number;
  skippedCount: number;
  executionMode?: "stored-procedure" | "direct-sql";
  reason?: string;
}

export interface ProjectLegacySyncResult {
  applied: boolean;
  processedCount: number;
  skippedCount: number;
  executionMode?: "stored-procedure" | "direct-sql";
  reason?: string;
}

export interface PriceListLegacySyncResult {
  applied: boolean;
  processedCount: number;
  skippedCount: number;
  executionMode?: "stored-procedure" | "direct-sql";
  reason?: string;
}

export interface ItemLegacySyncResult {
  applied: boolean;
  processedCount: number;
  skippedCount: number;
  executionMode?: "stored-procedure" | "direct-sql";
  reason?: string;
}

export interface UomGroupLegacySyncResult {
  applied: boolean;
  processedCount: number;
  skippedCount: number;
  executionMode?: "stored-procedure" | "direct-sql";
  reason?: string;
}

export interface UomConversionLegacySyncResult {
  applied: boolean;
  processedCount: number;
  skippedCount: number;
  executionMode?: "stored-procedure" | "direct-sql";
  reason?: string;
}

export interface BankLegacySyncResult {
  applied: boolean;
  processedCount: number;
  skippedCount: number;
  executionMode?: "stored-procedure" | "direct-sql";
  reason?: string;
}

export interface BranchLegacySyncResult {
  applied: boolean;
  processedCount: number;
  skippedCount: number;
  executionMode?: "stored-procedure" | "direct-sql";
  reason?: string;
}

export interface SerialNumberLegacySyncResult {
  applied: boolean;
  processedCount: number;
  skippedCount: number;
  executionMode?: "stored-procedure" | "direct-sql";
  reason?: string;
}

let poolPromise: Promise<sql.ConnectionPool> | null = null;
let initialized = false;

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function getLocalDbEnv(): LocalDbEnv {
  return {
    enabled: parseBoolean(process.env.LOCAL_DB_ENABLED, false),
    writeMasterData: parseBoolean(process.env.LOCAL_DB_WRITE_MASTER_DATA, true),
    server: process.env.LOCAL_DB_SERVER ?? "",
    database: process.env.LOCAL_DB_NAME ?? "",
    user: process.env.LOCAL_DB_USER ?? "",
    password: process.env.LOCAL_DB_PASSWORD ?? "",
    encrypt: parseBoolean(process.env.LOCAL_DB_ENCRYPT, false),
    trustServerCertificate: parseBoolean(process.env.LOCAL_DB_TRUST_SERVER_CERTIFICATE, true),
  };
}

function getConfig(): SqlConfig {
  const env = getLocalDbEnv();
  if (!env.server || !env.database || !env.user || !env.password) {
    throw new Error(
      "LOCAL_DB is enabled but LOCAL_DB_SERVER/LOCAL_DB_NAME/LOCAL_DB_USER/LOCAL_DB_PASSWORD are missing"
    );
  }

  return {
    server: env.server,
    database: env.database,
    user: env.user,
    password: env.password,
    options: {
      encrypt: env.encrypt,
      trustServerCertificate: env.trustServerCertificate,
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
  };
}

export function isLocalDbEnabled(): boolean {
  return getLocalDbEnv().enabled;
}

export function isLocalDbMasterDataWriteEnabled(): boolean {
  const env = getLocalDbEnv();
  return env.enabled && env.writeMasterData;
}

async function getPool(): Promise<sql.ConnectionPool> {
  if (!poolPromise) {
    poolPromise = sql.connect(getConfig());
  }
  return poolPromise;
}

async function ensureSchema(): Promise<void> {
  if (initialized) {
    return;
  }

  const pool = await getPool();

  await pool
    .request()
    .batch(`
      IF OBJECT_ID('dbo.SyncTransactions', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.SyncTransactions (
          TransactionId NVARCHAR(64) NOT NULL PRIMARY KEY,
          [Key] NVARCHAR(120) NOT NULL,
          DryRun BIT NOT NULL,
          [Status] NVARCHAR(32) NOT NULL,
          Query NVARCHAR(MAX) NULL,
          TargetOverridePath NVARCHAR(400) NULL,
          SourcePath NVARCHAR(400) NULL,
          TargetPath NVARCHAR(400) NULL,
          SourceCount INT NULL,
          PostedCount INT NULL,
          SkippedCount INT NULL,
          ErrorMessage NVARCHAR(MAX) NULL,
          StartedAt DATETIME2 NOT NULL,
          EndedAt DATETIME2 NULL
        );
      END;

      IF OBJECT_ID('dbo.SyncTransactionEvents', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.SyncTransactionEvents (
          EventId NVARCHAR(64) NOT NULL PRIMARY KEY,
          TransactionId NVARCHAR(64) NOT NULL,
          [Timestamp] DATETIME2 NOT NULL,
          [Level] NVARCHAR(16) NOT NULL,
          Stage NVARCHAR(120) NOT NULL,
          [Message] NVARCHAR(MAX) NOT NULL,
          DetailsJson NVARCHAR(MAX) NULL
        );
      END;

      IF OBJECT_ID('dbo.SyncMasterDataRaw', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.SyncMasterDataRaw (
          Id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
          TransactionId NVARCHAR(64) NOT NULL,
          MasterKey NVARCHAR(120) NOT NULL,
          SourcePath NVARCHAR(400) NOT NULL,
          PayloadJson NVARCHAR(MAX) NOT NULL,
          CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
        );

        CREATE INDEX IX_SyncMasterDataRaw_MasterKey_CreatedAt
          ON dbo.SyncMasterDataRaw (MasterKey, CreatedAt DESC);
      END;
    `);

  initialized = true;
}

function combineReasons(...reasons: Array<string | undefined>): string | undefined {
  const merged = reasons.filter((reason): reason is string => !!reason && reason.trim().length > 0);
  return merged.length > 0 ? merged.join("; ") : undefined;
}

export async function checkLocalDbHealth(): Promise<{ ok: boolean; message: string }> {
  if (!isLocalDbEnabled()) {
    return { ok: false, message: "LOCAL_DB_ENABLED is false" };
  }

  try {
    await ensureSchema();
    const pool = await getPool();
    const result = await pool.request().query("SELECT 1 AS ok");
    const ok = result.recordset?.[0]?.ok === 1;
    return { ok, message: ok ? "Local DB connected" : "Local DB query failed" };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Unknown local DB error",
    };
  }
}

export async function upsertSyncTransactionDb(input: {
  transactionId: string;
  key: string;
  dryRun: boolean;
  status: string;
  query?: string;
  targetOverridePath?: string;
  sourcePath?: string;
  targetPath?: string;
  sourceCount?: number;
  postedCount?: number;
  skippedCount?: number;
  error?: string;
  startedAt: string;
  endedAt?: string;
}): Promise<void> {
  if (!isLocalDbEnabled()) {
    return;
  }

  await ensureSchema();
  const pool = await getPool();

  await pool
    .request()
    .input("TransactionId", sql.NVarChar(64), input.transactionId)
    .input("Key", sql.NVarChar(120), input.key)
    .input("DryRun", sql.Bit, input.dryRun)
    .input("Status", sql.NVarChar(32), input.status)
    .input("Query", sql.NVarChar(sql.MAX), input.query ?? null)
    .input("TargetOverridePath", sql.NVarChar(400), input.targetOverridePath ?? null)
    .input("SourcePath", sql.NVarChar(400), input.sourcePath ?? null)
    .input("TargetPath", sql.NVarChar(400), input.targetPath ?? null)
    .input("SourceCount", sql.Int, input.sourceCount ?? null)
    .input("PostedCount", sql.Int, input.postedCount ?? null)
    .input("SkippedCount", sql.Int, input.skippedCount ?? null)
    .input("ErrorMessage", sql.NVarChar(sql.MAX), input.error ?? null)
    .input("StartedAt", sql.DateTime2, new Date(input.startedAt))
    .input("EndedAt", sql.DateTime2, input.endedAt ? new Date(input.endedAt) : null)
    .batch(`
      MERGE dbo.SyncTransactions AS target
      USING (SELECT @TransactionId AS TransactionId) AS src
      ON target.TransactionId = src.TransactionId
      WHEN MATCHED THEN UPDATE SET
        [Key] = @Key,
        DryRun = @DryRun,
        [Status] = @Status,
        Query = @Query,
        TargetOverridePath = @TargetOverridePath,
        SourcePath = @SourcePath,
        TargetPath = @TargetPath,
        SourceCount = @SourceCount,
        PostedCount = @PostedCount,
        SkippedCount = @SkippedCount,
        ErrorMessage = @ErrorMessage,
        StartedAt = @StartedAt,
        EndedAt = @EndedAt
      WHEN NOT MATCHED THEN
        INSERT (TransactionId, [Key], DryRun, [Status], Query, TargetOverridePath, SourcePath, TargetPath, SourceCount, PostedCount, SkippedCount, ErrorMessage, StartedAt, EndedAt)
        VALUES (@TransactionId, @Key, @DryRun, @Status, @Query, @TargetOverridePath, @SourcePath, @TargetPath, @SourceCount, @PostedCount, @SkippedCount, @ErrorMessage, @StartedAt, @EndedAt);
    `);
}

export async function insertSyncEventDb(input: {
  eventId: string;
  transactionId: string;
  timestamp: string;
  level: string;
  stage: string;
  message: string;
  details?: unknown;
}): Promise<void> {
  if (!isLocalDbEnabled()) {
    return;
  }

  await ensureSchema();
  const pool = await getPool();

  await pool
    .request()
    .input("EventId", sql.NVarChar(64), input.eventId)
    .input("TransactionId", sql.NVarChar(64), input.transactionId)
    .input("Timestamp", sql.DateTime2, new Date(input.timestamp))
    .input("Level", sql.NVarChar(16), input.level)
    .input("Stage", sql.NVarChar(120), input.stage)
    .input("Message", sql.NVarChar(sql.MAX), input.message)
    .input("DetailsJson", sql.NVarChar(sql.MAX), input.details ? JSON.stringify(input.details) : null)
    .query(`
      IF NOT EXISTS (SELECT 1 FROM dbo.SyncTransactionEvents WHERE EventId = @EventId)
      BEGIN
        INSERT INTO dbo.SyncTransactionEvents (EventId, TransactionId, [Timestamp], [Level], Stage, [Message], DetailsJson)
        VALUES (@EventId, @TransactionId, @Timestamp, @Level, @Stage, @Message, @DetailsJson);
      END
    `);
}

export async function getRecentSyncTransactionsFromDb(limit: number): Promise<
  Array<{
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
  }>
> {
  if (!isLocalDbEnabled()) {
    return [];
  }

  await ensureSchema();
  const pool = await getPool();
  const safeLimit = Math.min(Math.max(limit, 1), 200);

  const result = await pool
    .request()
    .input("TopN", sql.Int, safeLimit)
    .query(`
      SELECT TOP (@TopN)
        TransactionId AS transactionId,
        [Key] AS [key],
        [Status] AS [status],
        DryRun AS dryRun,
        CONVERT(NVARCHAR(33), StartedAt, 127) AS startedAt,
        CASE WHEN EndedAt IS NULL THEN NULL ELSE CONVERT(NVARCHAR(33), EndedAt, 127) END AS endedAt,
        SourceCount AS sourceCount,
        PostedCount AS postedCount,
        SkippedCount AS skippedCount,
        ErrorMessage AS errorMessage
      FROM dbo.SyncTransactions
      ORDER BY StartedAt DESC;
    `);

  return result.recordset as Array<{
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
  }>;
}

export async function insertMasterDataRawBatch(input: {
  transactionId: string;
  key: string;
  sourcePath: string;
  records: unknown[];
}): Promise<number> {
  if (!isLocalDbMasterDataWriteEnabled()) {
    return 0;
  }

  if (input.records.length === 0) {
    return 0;
  }

  await ensureSchema();
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  await transaction.begin();

  try {
    for (const record of input.records) {
      const request = new sql.Request(transaction);
      await request
        .input("TransactionId", sql.NVarChar(64), input.transactionId)
        .input("MasterKey", sql.NVarChar(120), input.key)
        .input("SourcePath", sql.NVarChar(400), input.sourcePath)
        .input("PayloadJson", sql.NVarChar(sql.MAX), JSON.stringify(record))
        .query(`
          INSERT INTO dbo.SyncMasterDataRaw (TransactionId, MasterKey, SourcePath, PayloadJson)
          VALUES (@TransactionId, @MasterKey, @SourcePath, @PayloadJson);
        `);
    }

    await transaction.commit();
    return input.records.length;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function syncAccountsToLegacyTable(input: {
  records: unknown[];
}): Promise<AccountsLegacySyncResult> {
  if (!isLocalDbMasterDataWriteEnabled()) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "LOCAL_DB accounts sync is disabled",
    };
  }

  const mappedRows = input.records
    .map((record) => mapAccountLegacyRow(record))
    .filter((record): record is AccountLegacyRow => record !== null);

  if (mappedRows.length === 0) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "No account rows could be mapped to the legacy tblRefAccounts shape",
    };
  }

  await ensureSchema();
  const pool = await getPool();
  const procedureCheck = await pool.request().query(`
    SELECT
      CASE WHEN OBJECT_ID('dbo.tblRefAccounts_Clear_UpdateInactive', 'P') IS NULL THEN 0 ELSE 1 END AS hasClearProcedure,
      CASE WHEN OBJECT_ID('dbo.tblRefAccounts_Insert', 'P') IS NULL THEN 0 ELSE 1 END AS hasInsertProcedure,
      CASE WHEN OBJECT_ID('dbo.tblRefAccounts_UpdateInactive', 'P') IS NULL THEN 0 ELSE 1 END AS hasUpdateInactiveProcedure;
  `);

  const hasClearProcedure = procedureCheck.recordset?.[0]?.hasClearProcedure === 1;
  const hasInsertProcedure = procedureCheck.recordset?.[0]?.hasInsertProcedure === 1;
  const hasUpdateInactiveProcedure = procedureCheck.recordset?.[0]?.hasUpdateInactiveProcedure === 1;

  if (hasClearProcedure && hasInsertProcedure && hasUpdateInactiveProcedure) {
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      await new sql.Request(transaction).execute("dbo.tblRefAccounts_Clear_UpdateInactive");

      for (const record of mappedRows) {
        await new sql.Request(transaction)
          .input("Account", sql.VarChar(50), record.account)
          .input("Master_Sub_Account", sql.VarChar(50), record.masterSubAccount)
          .input("Account_Type", sql.VarChar(50), record.accountType)
          .input("AccountLink", sql.VarChar(500), record.accountLink)
          .input("Description", sql.VarChar(500), record.description)
          .input("TaxLink", sql.Int, record.taxLink)
          .input("Status", sql.Bit, record.status)
          .execute("dbo.tblRefAccounts_Insert");
      }

      await new sql.Request(transaction).execute("dbo.tblRefAccounts_UpdateInactive");
      await transaction.commit();

      return {
        applied: true,
        processedCount: mappedRows.length,
        skippedCount: input.records.length - mappedRows.length,
        executionMode: "stored-procedure",
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  const fallbackReason =
    hasClearProcedure || hasInsertProcedure || hasUpdateInactiveProcedure
      ? "Accounts stored procedure set was incomplete; fell back to direct SQL"
      : undefined;

  const tableCheck = await pool.request().query(`
    SELECT CASE WHEN OBJECT_ID('dbo.tblRefAccounts', 'U') IS NULL THEN 0 ELSE 1 END AS hasTable;
  `);

  if (tableCheck.recordset?.[0]?.hasTable !== 1) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "dbo.tblRefAccounts was not found in LOCAL_DB",
    };
  }

  const columnsResult = await pool.request().query(`
    SELECT [name]
    FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.tblRefAccounts', 'U');
  `);

  const availableColumns = new Set(
    (columnsResult.recordset ?? []).map((record) => String(record.name))
  );

  if (!availableColumns.has("AccountLink_1")) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "tblRefAccounts does not expose AccountLink_1, so legacy accounts upsert cannot run",
    };
  }

  const accountColumns = [
    { column: "Account", param: "Account" },
    { column: "Master_Sub_Account", param: "Master_Sub_Account" },
    { column: "Account_Type", param: "Account_Type" },
    { column: "AccountLink_1", param: "AccountLink_1" },
    { column: "Description", param: "Description" },
    { column: "TaxLink", param: "TaxLink" },
    { column: "Status", param: "Status" },
  ].filter((entry) => availableColumns.has(entry.column));

  const hasStatus = availableColumns.has("Status");
  const hasImportStatus = availableColumns.has("ImportStatus");

  const updateParts = accountColumns
    .filter((entry) => entry.column !== "AccountLink_1")
    .map((entry) => `[${entry.column}] = @${entry.param}`);

  if (hasImportStatus) {
    updateParts.push("[ImportStatus] = 1");
  }

  const updateAssignments =
    updateParts.length > 0 ? updateParts.join(",\n              ") : "[AccountLink_1] = @AccountLink_1";

  const insertColumns = accountColumns.map((entry) => `[${entry.column}]`);
  const insertValues = accountColumns.map((entry) => `@${entry.param}`);

  if (hasImportStatus) {
    insertColumns.push("[ImportStatus]");
    insertValues.push("1");
  }

  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    if (hasImportStatus) {
      await new sql.Request(transaction).query("UPDATE dbo.tblRefAccounts SET ImportStatus = 0;");
    }

    await new sql.Request(transaction).query(`
      CREATE TABLE #ImportedAccounts (
        AccountLink_1 VARCHAR(500) NOT NULL PRIMARY KEY
      );
    `);

    for (const record of mappedRows) {
      await new sql.Request(transaction)
        .input("Account", sql.VarChar(50), record.account)
        .input("Master_Sub_Account", sql.VarChar(50), record.masterSubAccount)
        .input("Account_Type", sql.VarChar(50), record.accountType)
        .input("AccountLink_1", sql.VarChar(500), record.accountLink)
        .input("Description", sql.VarChar(500), record.description)
        .input("TaxLink", sql.Int, record.taxLink)
        .input("Status", sql.Bit, record.status)
        .query(`
          IF EXISTS (SELECT 1 FROM dbo.tblRefAccounts WHERE AccountLink_1 = @AccountLink_1)
          BEGIN
            UPDATE dbo.tblRefAccounts
            SET
              ${updateAssignments}
            WHERE AccountLink_1 = @AccountLink_1;
          END
          ELSE
          BEGIN
            INSERT INTO dbo.tblRefAccounts (
              ${insertColumns.join(",\n              ")}
            )
            VALUES (
              ${insertValues.join(",\n              ")}
            );
          END;

          IF NOT EXISTS (SELECT 1 FROM #ImportedAccounts WHERE AccountLink_1 = @AccountLink_1)
          BEGIN
            INSERT INTO #ImportedAccounts (AccountLink_1)
            VALUES (@AccountLink_1);
          END;
        `);
    }

    if (hasStatus) {
      if (hasImportStatus) {
        await new sql.Request(transaction).query(`
          UPDATE dbo.tblRefAccounts
          SET [Status] = 0
          WHERE ImportStatus = 0;
        `);
      } else {
        await new sql.Request(transaction).query(`
          UPDATE dbo.tblRefAccounts
          SET [Status] = 0
          WHERE NOT EXISTS (
            SELECT 1
            FROM #ImportedAccounts imported
            WHERE imported.AccountLink_1 = dbo.tblRefAccounts.AccountLink_1
          );
        `);
      }
    }

    await transaction.commit();

    return {
      applied: true,
      processedCount: mappedRows.length,
      skippedCount: input.records.length - mappedRows.length,
      executionMode: "direct-sql",
      reason: combineReasons(
        fallbackReason,
        !hasStatus ? "tblRefAccounts does not expose Status; inactive rows could not be marked" : undefined,
        !hasImportStatus && hasStatus
          ? "tblRefAccounts does not expose ImportStatus; inactive rows were derived using imported AccountLink_1 values"
          : undefined
      ),
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function syncCustomerToLegacyTable(input: {
  records: unknown[];
}): Promise<CustomerLegacySyncResult> {
  if (!isLocalDbMasterDataWriteEnabled()) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "LOCAL_DB customer sync is disabled",
    };
  }

  const mappedRows = input.records
    .map((record) => mapCustomerLegacyRow(record))
    .filter((record): record is CustomerLegacyRow => record !== null);

  if (mappedRows.length === 0) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "No customer rows could be mapped to the legacy tblRefCustomer shape",
    };
  }

  await ensureSchema();
  const pool = await getPool();
  const procedureCheck = await pool.request().query(`
    SELECT
      CASE WHEN OBJECT_ID('dbo.tblRefCustomer_Insert', 'P') IS NULL THEN 0 ELSE 1 END AS hasInsertProcedure,
      CASE WHEN OBJECT_ID('dbo.tblRefCustomer_UpdateInactive', 'P') IS NULL THEN 0 ELSE 1 END AS hasUpdateInactiveProcedure;
  `);

  const hasInsertProcedure = procedureCheck.recordset?.[0]?.hasInsertProcedure === 1;
  const hasUpdateInactiveProcedure = procedureCheck.recordset?.[0]?.hasUpdateInactiveProcedure === 1;

  if (hasInsertProcedure && hasUpdateInactiveProcedure) {
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      for (const record of mappedRows) {
        await new sql.Request(transaction)
          .input("CustCode", sql.VarChar(100), record.custCode)
          .input("CustName", sql.NVarChar(200), record.custName)
          .input("Address1", sql.NVarChar(200), record.address1)
          .input("Address2", sql.NVarChar(200), record.address2)
          .input("Address3", sql.NVarChar(200), record.address3)
          .input("Address4", sql.NVarChar(200), record.address4)
          .input("Country", sql.VarChar(50), record.country)
          .input("Address1P", sql.NVarChar(200), record.address1P)
          .input("Address2P", sql.NVarChar(200), record.address2P)
          .input("Address3P", sql.NVarChar(200), record.address3P)
          .input("Address4P", sql.NVarChar(200), record.address4P)
          .input("CountryP", sql.VarChar(50), record.countryP)
          .input("BRegNo", sql.VarChar(100), record.bRegNo)
          .input("TPNo", sql.VarChar(100), record.tpNo)
          .input("Fax", sql.VarChar(100), record.fax)
          .input("Email", sql.VarChar(200), record.email)
          .input("VATNo", sql.VarChar(100), record.vatNo)
          .input("SVATNo", sql.VarChar(100), record.svatNo)
          .input("TAXSTATUS", sql.VarChar(50), record.taxStatus)
          .input("SettlemntTermsID", sql.Int, record.settlementTermsId)
          .input("CustomerType", sql.VarChar(20), record.customerType)
          .input("CustGrp", sql.NVarChar(100), record.custGrp)
          .input("RepID", sql.VarChar(50), record.repId)
          .input("NIC", sql.VarChar(100), record.nic)
          .input("Remarks", sql.NVarChar(500), record.remarks)
          .input("InsuranceCustomer", sql.VarChar(10), record.insuranceCustomer)
          .input("Status", sql.Bit, record.status)
          .input("ContactPerson", sql.NVarChar(100), record.contactPerson)
          .input("CurrencyCode", sql.VarChar(50), record.currencyCode)
          .execute("dbo.tblRefCustomer_Insert");
      }

      await new sql.Request(transaction).execute("dbo.tblRefCustomer_UpdateInactive");
      await transaction.commit();

      return {
        applied: true,
        processedCount: mappedRows.length,
        skippedCount: input.records.length - mappedRows.length,
        executionMode: "stored-procedure",
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  const fallbackReason =
    hasInsertProcedure || hasUpdateInactiveProcedure
      ? "Customer stored procedure set was incomplete; fell back to direct SQL"
      : undefined;

  const tableCheck = await pool.request().query(`
    SELECT CASE WHEN OBJECT_ID('dbo.tblRefCustomer', 'U') IS NULL THEN 0 ELSE 1 END AS hasTable;
  `);

  if (tableCheck.recordset?.[0]?.hasTable !== 1) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "dbo.tblRefCustomer was not found in LOCAL_DB",
    };
  }

  const columnsResult = await pool.request().query(`
    SELECT [name]
    FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.tblRefCustomer', 'U');
  `);

  const availableColumns = new Set(
    (columnsResult.recordset ?? []).map((record) => String(record.name))
  );

  if (!availableColumns.has("CustCode")) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "tblRefCustomer does not expose CustCode, so legacy customer upsert cannot run",
    };
  }

  const customerColumns = [
    { column: "CustCode", param: "CustCode" },
    { column: "CustName", param: "CustName" },
    { column: "Address1", param: "Address1" },
    { column: "Address2", param: "Address2" },
    { column: "Address3", param: "Address3" },
    { column: "Address4", param: "Address4" },
    { column: "Country", param: "Country" },
    { column: "Address1P", param: "Address1P" },
    { column: "Address2P", param: "Address2P" },
    { column: "Address3P", param: "Address3P" },
    { column: "Address4P", param: "Address4P" },
    { column: "CountryP", param: "CountryP" },
    { column: "BRegNo", param: "BRegNo" },
    { column: "TPNo", param: "TPNo" },
    { column: "Fax", param: "Fax" },
    { column: "Email", param: "Email" },
    { column: "VATNo", param: "VATNo" },
    { column: "SVATNo", param: "SVATNo" },
    { column: "TAXSTATUS", param: "TAXSTATUS" },
    { column: "SettlemntTermsID", param: "SettlemntTermsID" },
    { column: "CustomerType", param: "CustomerType" },
    { column: "CustGrp", param: "CustGrp" },
    { column: "RepID", param: "RepID" },
    { column: "NIC", param: "NIC" },
    { column: "Remarks", param: "Remarks" },
    { column: "InsuranceCustomer", param: "InsuranceCustomer" },
    { column: "Status", param: "Status" },
    { column: "ContactPerson", param: "ContactPerson" },
    { column: "CurrencyCode", param: "CurrencyCode" },
  ].filter((entry) => availableColumns.has(entry.column));

  const hasStatus = availableColumns.has("Status");
  const hasImportStatus = availableColumns.has("ImportStatus");

  const updateParts = customerColumns
    .filter((entry) => entry.column !== "CustCode")
    .map((entry) => `[${entry.column}] = @${entry.param}`);

  if (hasImportStatus) {
    updateParts.push("[ImportStatus] = 1");
  }

  const updateAssignments =
    updateParts.length > 0 ? updateParts.join(",\n              ") : "[CustCode] = @CustCode";

  const insertColumns = customerColumns.map((entry) => `[${entry.column}]`);
  const insertValues = customerColumns.map((entry) => `@${entry.param}`);

  if (hasImportStatus) {
    insertColumns.push("[ImportStatus]");
    insertValues.push("1");
  }

  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    await new sql.Request(transaction).query(`
      CREATE TABLE #ImportedCustomers (
        CustCode VARCHAR(100) NOT NULL PRIMARY KEY
      );
    `);

    for (const record of mappedRows) {
      await new sql.Request(transaction)
        .input("CustCode", sql.VarChar(100), record.custCode)
        .input("CustName", sql.NVarChar(200), record.custName)
        .input("Address1", sql.NVarChar(200), record.address1)
        .input("Address2", sql.NVarChar(200), record.address2)
        .input("Address3", sql.NVarChar(200), record.address3)
        .input("Address4", sql.NVarChar(200), record.address4)
        .input("Country", sql.VarChar(50), record.country)
        .input("Address1P", sql.NVarChar(200), record.address1P)
        .input("Address2P", sql.NVarChar(200), record.address2P)
        .input("Address3P", sql.NVarChar(200), record.address3P)
        .input("Address4P", sql.NVarChar(200), record.address4P)
        .input("CountryP", sql.VarChar(50), record.countryP)
        .input("BRegNo", sql.VarChar(100), record.bRegNo)
        .input("TPNo", sql.VarChar(100), record.tpNo)
        .input("Fax", sql.VarChar(100), record.fax)
        .input("Email", sql.VarChar(200), record.email)
        .input("VATNo", sql.VarChar(100), record.vatNo)
        .input("SVATNo", sql.VarChar(100), record.svatNo)
        .input("TAXSTATUS", sql.VarChar(50), record.taxStatus)
        .input("SettlemntTermsID", sql.Int, record.settlementTermsId)
        .input("CustomerType", sql.VarChar(20), record.customerType)
        .input("CustGrp", sql.NVarChar(100), record.custGrp)
        .input("RepID", sql.VarChar(50), record.repId)
        .input("NIC", sql.VarChar(100), record.nic)
        .input("Remarks", sql.NVarChar(500), record.remarks)
        .input("InsuranceCustomer", sql.VarChar(10), record.insuranceCustomer)
        .input("Status", sql.Bit, record.status)
        .input("ContactPerson", sql.NVarChar(100), record.contactPerson)
        .input("CurrencyCode", sql.VarChar(50), record.currencyCode)
        .query(`
          IF EXISTS (SELECT 1 FROM dbo.tblRefCustomer WHERE CustCode = @CustCode)
          BEGIN
            UPDATE dbo.tblRefCustomer
            SET
              ${updateAssignments}
            WHERE CustCode = @CustCode;
          END
          ELSE
          BEGIN
            INSERT INTO dbo.tblRefCustomer (
              ${insertColumns.join(",\n              ")}
            )
            VALUES (
              ${insertValues.join(",\n              ")}
            );
          END;

          IF NOT EXISTS (SELECT 1 FROM #ImportedCustomers WHERE CustCode = @CustCode)
          BEGIN
            INSERT INTO #ImportedCustomers (CustCode)
            VALUES (@CustCode);
          END;
        `);
    }

    if (hasStatus) {
      await new sql.Request(transaction).query(`
        UPDATE dbo.tblRefCustomer
        SET [Status] = 0${hasImportStatus ? ", ImportStatus = 0" : ""}
        WHERE NOT EXISTS (
          SELECT 1
          FROM #ImportedCustomers imported
          WHERE imported.CustCode = dbo.tblRefCustomer.CustCode
        );
      `);
    } else if (hasImportStatus) {
      await new sql.Request(transaction).query(`
        UPDATE dbo.tblRefCustomer
        SET ImportStatus = 0
        WHERE NOT EXISTS (
          SELECT 1
          FROM #ImportedCustomers imported
          WHERE imported.CustCode = dbo.tblRefCustomer.CustCode
        );
      `);
    }

    await transaction.commit();

    return {
      applied: true,
      processedCount: mappedRows.length,
      skippedCount: input.records.length - mappedRows.length,
      executionMode: "direct-sql",
      reason: combineReasons(
        fallbackReason,
        !hasStatus ? "tblRefCustomer does not expose Status; inactive rows could not be marked" : undefined,
        !hasImportStatus
          ? "tblRefCustomer does not expose ImportStatus; imported rows are matched only by CustCode"
          : undefined
      ),
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function syncVendorToLegacyTable(input: {
  records: unknown[];
}): Promise<VendorLegacySyncResult> {
  if (!isLocalDbMasterDataWriteEnabled()) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "LOCAL_DB vendor sync is disabled",
    };
  }

  const mappedRows = input.records
    .map((record) => mapVendorLegacyRow(record))
    .filter((record): record is VendorLegacyRow => record !== null);

  if (mappedRows.length === 0) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "No vendor rows could be mapped to the legacy tblRefVendor shape",
    };
  }

  await ensureSchema();
  const pool = await getPool();

  const procedureCheck = await pool.request().query(`
    SELECT
      CASE WHEN OBJECT_ID('dbo.tblRefVendor_Update_ImportStatus', 'P') IS NULL THEN 0 ELSE 1 END AS hasUpdateImportStatusProcedure,
      CASE WHEN OBJECT_ID('dbo.tblRefVendor_Insert', 'P') IS NULL THEN 0 ELSE 1 END AS hasInsertProcedure,
      CASE WHEN OBJECT_ID('dbo.tblRefVendor_UpdateInactive', 'P') IS NULL THEN 0 ELSE 1 END AS hasUpdateInactiveProcedure;
  `);

  const hasUpdateImportStatusProcedure =
    procedureCheck.recordset?.[0]?.hasUpdateImportStatusProcedure === 1;
  const hasInsertProcedure = procedureCheck.recordset?.[0]?.hasInsertProcedure === 1;
  const hasUpdateInactiveProcedure = procedureCheck.recordset?.[0]?.hasUpdateInactiveProcedure === 1;

  if (hasUpdateImportStatusProcedure && hasInsertProcedure && hasUpdateInactiveProcedure) {
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      await new sql.Request(transaction).execute("dbo.tblRefVendor_Update_ImportStatus");

      for (const record of mappedRows) {
        await new sql.Request(transaction)
          .input("VendorCode", sql.VarChar(20), record.vendorCode)
          .input("VendorName", sql.VarChar(100), record.vendorName)
          .input("ImportStatus", sql.Bit, true)
          .input("Status", sql.Bit, record.status)
          .input("TaxLink", sql.Int, record.taxLink)
          .input("Address", sql.VarChar(500), record.address)
          .input("Fax", sql.VarChar(500), record.fax)
          .input("Email", sql.VarChar(500), record.email)
          .input("TPNo", sql.VarChar(500), record.tpNo)
          .input("CurrencyCode", sql.VarChar(50), record.currencyCode)
          .execute("dbo.tblRefVendor_Insert");
      }

      await new sql.Request(transaction).execute("dbo.tblRefVendor_UpdateInactive");
      await transaction.commit();

      return {
        applied: true,
        processedCount: mappedRows.length,
        skippedCount: input.records.length - mappedRows.length,
        executionMode: "stored-procedure",
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  const fallbackReason =
    hasUpdateImportStatusProcedure || hasInsertProcedure || hasUpdateInactiveProcedure
      ? "Vendor stored procedure set was incomplete; fell back to direct SQL"
      : undefined;

  const tableCheck = await pool.request().query(`
    SELECT CASE WHEN OBJECT_ID('dbo.tblRefVendor', 'U') IS NULL THEN 0 ELSE 1 END AS hasTable;
  `);

  if (tableCheck.recordset?.[0]?.hasTable !== 1) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "dbo.tblRefVendor was not found in LOCAL_DB",
    };
  }

  const columnsResult = await pool.request().query(`
    SELECT [name]
    FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.tblRefVendor', 'U');
  `);

  const availableColumns = new Set(
    (columnsResult.recordset ?? []).map((record) => String(record.name))
  );

  if (!availableColumns.has("VendorCode")) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "tblRefVendor does not expose VendorCode, so legacy vendor upsert cannot run",
    };
  }

  const vendorColumns = [
    { column: "VendorCode", param: "VendorCode" },
    { column: "VendorName", param: "VendorName" },
    { column: "Status", param: "Status" },
    { column: "TaxLink", param: "TaxLink" },
    { column: "Address", param: "Address" },
    { column: "Fax", param: "Fax" },
    { column: "Email", param: "Email" },
    { column: "TPNo", param: "TPNo" },
    { column: "CurrencyCode", param: "CurrencyCode" },
  ].filter((entry) => availableColumns.has(entry.column));

  const hasStatus = availableColumns.has("Status");
  const hasImportStatus = availableColumns.has("ImportStatus");

  const updateParts = vendorColumns
    .filter((entry) => entry.column !== "VendorCode")
    .map((entry) => `[${entry.column}] = @${entry.param}`);

  if (hasImportStatus) {
    updateParts.push("[ImportStatus] = 1");
  }

  const updateAssignments =
    updateParts.length > 0
      ? updateParts.join(",\n              ")
      : "[VendorCode] = @VendorCode";

  const insertColumns = vendorColumns.map((entry) => `[${entry.column}]`);
  const insertValues = vendorColumns.map((entry) => `@${entry.param}`);

  if (hasImportStatus) {
    insertColumns.push("[ImportStatus]");
    insertValues.push("1");
  }

  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    if (hasImportStatus) {
      await new sql.Request(transaction).query("UPDATE dbo.tblRefVendor SET ImportStatus = 0;");
    }

    await new sql.Request(transaction).query(`
      CREATE TABLE #ImportedVendors (
        VendorCode VARCHAR(20) NOT NULL PRIMARY KEY
      );
    `);

    for (const record of mappedRows) {
      await new sql.Request(transaction)
        .input("VendorCode", sql.VarChar(20), record.vendorCode)
        .input("VendorName", sql.VarChar(100), record.vendorName)
        .input("Status", sql.Bit, record.status)
        .input("TaxLink", sql.Int, record.taxLink)
        .input("Address", sql.VarChar(500), record.address)
        .input("Fax", sql.VarChar(500), record.fax)
        .input("Email", sql.VarChar(500), record.email)
        .input("TPNo", sql.VarChar(500), record.tpNo)
        .input("CurrencyCode", sql.VarChar(50), record.currencyCode)
        .query(`
          IF EXISTS (SELECT 1 FROM dbo.tblRefVendor WHERE VendorCode = @VendorCode)
          BEGIN
            UPDATE dbo.tblRefVendor
            SET
              ${updateAssignments}
            WHERE VendorCode = @VendorCode;
          END
          ELSE
          BEGIN
            INSERT INTO dbo.tblRefVendor (
              ${insertColumns.join(",\n              ")}
            )
            VALUES (
              ${insertValues.join(",\n              ")}
            );
          END;

          IF NOT EXISTS (SELECT 1 FROM #ImportedVendors WHERE VendorCode = @VendorCode)
          BEGIN
            INSERT INTO #ImportedVendors (VendorCode)
            VALUES (@VendorCode);
          END;
        `);
    }

    if (hasStatus) {
      if (hasImportStatus) {
        // Mirror tblRefVendor_UpdateInactive: delete rows with ImportStatus=0 and Status=0
        await new sql.Request(transaction).query(`
          UPDATE dbo.tblRefVendor
          SET [Status] = 0
          WHERE ImportStatus = 0;

          DELETE FROM dbo.tblRefVendor
          WHERE ImportStatus = 0 AND ISNULL([Status], 0) = 0;
        `);
      } else {
        await new sql.Request(transaction).query(`
          UPDATE dbo.tblRefVendor
          SET [Status] = 0
          WHERE NOT EXISTS (
            SELECT 1
            FROM #ImportedVendors imported
            WHERE imported.VendorCode = dbo.tblRefVendor.VendorCode
          );
        `);
      }
    } else if (hasImportStatus) {
      await new sql.Request(transaction).query(`
        UPDATE dbo.tblRefVendor
        SET ImportStatus = 0
        WHERE NOT EXISTS (
          SELECT 1
          FROM #ImportedVendors imported
          WHERE imported.VendorCode = dbo.tblRefVendor.VendorCode
        );
      `);
    }

    await transaction.commit();

    return {
      applied: true,
      processedCount: mappedRows.length,
      skippedCount: input.records.length - mappedRows.length,
      executionMode: "direct-sql",
      reason: combineReasons(
        fallbackReason,
        !hasStatus ? "tblRefVendor does not expose Status; inactive rows could not be marked" : undefined,
        !hasImportStatus && hasStatus
          ? "tblRefVendor does not expose ImportStatus; inactive rows were derived using imported VendorCode values"
          : undefined
      ),
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function syncSalesRepToLegacyTable(input: {
  records: unknown[];
}): Promise<SalesRepLegacySyncResult> {
  if (!isLocalDbMasterDataWriteEnabled()) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "LOCAL_DB sales rep sync is disabled",
    };
  }

  const mappedRows = input.records
    .map((record) => mapSalesRepLegacyRow(record))
    .filter((record): record is SalesRepLegacyRow => record !== null);

  if (mappedRows.length === 0) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "No sales rep rows could be mapped to the legacy tblRefSalesRep shape",
    };
  }

  await ensureSchema();
  const pool = await getPool();

  const procedureCheck = await pool.request().query(`
    SELECT
      CASE WHEN OBJECT_ID('dbo.tblRefSalesRep_Clear_UpdateInactive', 'P') IS NULL THEN 0 ELSE 1 END AS hasClearProcedure,
      CASE WHEN OBJECT_ID('dbo.tblRefSalesRep_Insert', 'P') IS NULL THEN 0 ELSE 1 END AS hasInsertProcedure,
      CASE WHEN OBJECT_ID('dbo.tblRefSalesRep_UpdateInactive', 'P') IS NULL THEN 0 ELSE 1 END AS hasUpdateInactiveProcedure;
  `);

  const hasClearProcedure = procedureCheck.recordset?.[0]?.hasClearProcedure === 1;
  const hasInsertProcedure = procedureCheck.recordset?.[0]?.hasInsertProcedure === 1;
  const hasUpdateInactiveProcedure = procedureCheck.recordset?.[0]?.hasUpdateInactiveProcedure === 1;

  if (hasClearProcedure && hasInsertProcedure && hasUpdateInactiveProcedure) {
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      await new sql.Request(transaction).execute("dbo.tblRefSalesRep_Clear_UpdateInactive");

      for (const record of mappedRows) {
        await new sql.Request(transaction)
          .input("RepID", sql.VarChar(100), record.repId)
          .input("LastName", sql.VarChar(sql.MAX), record.lastName)
          .input("UserID", sql.Int, record.userId)
          .input("Status", sql.Bit, record.status)
          .execute("dbo.tblRefSalesRep_Insert");
      }

      await new sql.Request(transaction).execute("dbo.tblRefSalesRep_UpdateInactive");
      await transaction.commit();

      return {
        applied: true,
        processedCount: mappedRows.length,
        skippedCount: input.records.length - mappedRows.length,
        executionMode: "stored-procedure",
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  const fallbackReason =
    hasClearProcedure || hasInsertProcedure || hasUpdateInactiveProcedure
      ? "Sales rep stored procedure set was incomplete; fell back to direct SQL"
      : undefined;

  const tableCheck = await pool.request().query(`
    SELECT CASE WHEN OBJECT_ID('dbo.tblRefSalesRep', 'U') IS NULL THEN 0 ELSE 1 END AS hasTable;
  `);

  if (tableCheck.recordset?.[0]?.hasTable !== 1) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "dbo.tblRefSalesRep was not found in LOCAL_DB",
    };
  }

  const columnsResult = await pool.request().query(`
    SELECT [name]
    FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.tblRefSalesRep', 'U');
  `);

  const availableColumns = new Set(
    (columnsResult.recordset ?? []).map((record) => String(record.name))
  );

  if (!availableColumns.has("RepID")) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "tblRefSalesRep does not expose RepID, so legacy sales rep upsert cannot run",
    };
  }

  const salesRepColumns = [
    { column: "RepID", param: "RepID" },
    { column: "LastName", param: "LastName" },
    { column: "UserID", param: "UserID" },
    { column: "Status", param: "Status" },
  ].filter((entry) => availableColumns.has(entry.column));

  const hasStatus = availableColumns.has("Status");
  const hasImportStatus = availableColumns.has("ImportStatus");
  const hasRepLink = availableColumns.has("RepLink");

  const updateParts = salesRepColumns
    .filter((entry) => entry.column !== "RepID")
    .map((entry) => `[${entry.column}] = @${entry.param}`);

  if (hasImportStatus) {
    updateParts.push("[ImportStatus] = 1");
  }

  const updateAssignments =
    updateParts.length > 0 ? updateParts.join(",\n              ") : "[RepID] = @RepID";

  const insertColumns = salesRepColumns.map((entry) => `[${entry.column}]`);
  const insertValues = salesRepColumns.map((entry) => `@${entry.param}`);

  if (hasImportStatus) {
    insertColumns.push("[ImportStatus]");
    insertValues.push("1");
  }

  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    if (hasImportStatus) {
      await new sql.Request(transaction).query("UPDATE dbo.tblRefSalesRep SET ImportStatus = 0;");
    }

    await new sql.Request(transaction).query(`
      CREATE TABLE #ImportedSalesReps (
        RepID VARCHAR(100) NOT NULL PRIMARY KEY
      );
    `);

    for (const record of mappedRows) {
      await new sql.Request(transaction)
        .input("RepID", sql.VarChar(100), record.repId)
        .input("LastName", sql.VarChar(sql.MAX), record.lastName)
        .input("UserID", sql.Int, record.userId)
        .input("Status", sql.Bit, record.status)
        .query(`
          IF EXISTS (SELECT 1 FROM dbo.tblRefSalesRep WHERE RepID = @RepID)
          BEGIN
            UPDATE dbo.tblRefSalesRep
            SET
              ${updateAssignments}
            WHERE RepID = @RepID;
          END
          ELSE
          BEGIN
            INSERT INTO dbo.tblRefSalesRep (
              ${insertColumns.join(",\n              ")}
            )
            VALUES (
              ${insertValues.join(",\n              ")}
            );
          END;

          IF NOT EXISTS (SELECT 1 FROM #ImportedSalesReps WHERE RepID = @RepID)
          BEGIN
            INSERT INTO #ImportedSalesReps (RepID)
            VALUES (@RepID);
          END;
        `);
    }

    if (hasStatus && hasImportStatus && hasRepLink) {
      await new sql.Request(transaction).query(`
        IF OBJECT_ID('dbo.tblTransEstimateHeader', 'U') IS NOT NULL
        BEGIN
          UPDATE salesRep
          SET [Status] = 0
          FROM dbo.tblRefSalesRep salesRep
          WHERE salesRep.ImportStatus = 0
            AND salesRep.RepLink IN (
              SELECT SalesRepLink FROM dbo.tblTransEstimateHeader
            );
        END;

        IF OBJECT_ID('dbo.tblTransBOMHeader', 'U') IS NOT NULL
        BEGIN
          UPDATE salesRep
          SET [Status] = 0
          FROM dbo.tblRefSalesRep salesRep
          WHERE salesRep.ImportStatus = 0
            AND salesRep.RepLink IN (
              SELECT SalesRepLink FROM dbo.tblTransBOMHeader
            );
        END;

        IF OBJECT_ID('dbo.tblTransCreditNoteHeader', 'U') IS NOT NULL
        BEGIN
          UPDATE salesRep
          SET [Status] = 0
          FROM dbo.tblRefSalesRep salesRep
          WHERE salesRep.ImportStatus = 0
            AND salesRep.RepLink IN (
              SELECT RepLink FROM dbo.tblTransCreditNoteHeader
            );
        END;

        IF OBJECT_ID('dbo.tblTransInvoiceHeader', 'U') IS NOT NULL
        BEGIN
          UPDATE salesRep
          SET [Status] = 0
          FROM dbo.tblRefSalesRep salesRep
          WHERE salesRep.ImportStatus = 0
            AND salesRep.RepLink IN (
              SELECT SalesRepLink FROM dbo.tblTransInvoiceHeader
            );
        END;

        DELETE FROM dbo.tblRefSalesRep
        WHERE ImportStatus = 0 AND ISNULL([Status], 0) = 0;
      `);
    } else if (hasStatus) {
      if (hasImportStatus) {
        await new sql.Request(transaction).query(`
          UPDATE dbo.tblRefSalesRep
          SET [Status] = 0
          WHERE ImportStatus = 0;

          DELETE FROM dbo.tblRefSalesRep
          WHERE ImportStatus = 0 AND ISNULL([Status], 0) = 0;
        `);
      } else {
        await new sql.Request(transaction).query(`
          UPDATE dbo.tblRefSalesRep
          SET [Status] = 0
          WHERE NOT EXISTS (
            SELECT 1
            FROM #ImportedSalesReps imported
            WHERE imported.RepID = dbo.tblRefSalesRep.RepID
          );
        `);
      }
    } else if (hasImportStatus) {
      await new sql.Request(transaction).query(`
        UPDATE dbo.tblRefSalesRep
        SET ImportStatus = 0
        WHERE NOT EXISTS (
          SELECT 1
          FROM #ImportedSalesReps imported
          WHERE imported.RepID = dbo.tblRefSalesRep.RepID
        );
      `);
    }

    await transaction.commit();

    return {
      applied: true,
      processedCount: mappedRows.length,
      skippedCount: input.records.length - mappedRows.length,
      executionMode: "direct-sql",
      reason: combineReasons(
        fallbackReason,
        !hasStatus ? "tblRefSalesRep does not expose Status; inactive rows could not be marked" : undefined,
        !hasImportStatus && hasStatus
          ? "tblRefSalesRep does not expose ImportStatus; inactive rows were derived using imported RepID values"
          : undefined,
        hasStatus && hasImportStatus && !hasRepLink
          ? "tblRefSalesRep does not expose RepLink; inactive sales reps were handled without transaction-link preservation"
          : undefined
      ),
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function syncLoginUsersToLegacyTable(input: {
  records: unknown[];
}): Promise<LoginUsersLegacySyncResult> {
  if (!isLocalDbMasterDataWriteEnabled()) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "LOCAL_DB login user sync is disabled",
    };
  }

  const mappedRows = input.records
    .map((record) => mapLoginUserLegacyRow(record))
    .filter((record): record is LoginUserLegacyRow => record !== null);

  if (mappedRows.length === 0) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "No login user rows could be mapped to the legacy [Login] shape",
    };
  }

  await ensureSchema();
  const pool = await getPool();

  const procedureCheck = await pool.request().query(`
    SELECT
      CASE WHEN OBJECT_ID('dbo.Login_Clear_UpdateInactive', 'P') IS NULL THEN 0 ELSE 1 END AS hasClearProcedure,
      CASE WHEN OBJECT_ID('dbo.Login_Insert', 'P') IS NULL THEN 0 ELSE 1 END AS hasInsertProcedure,
      CASE WHEN OBJECT_ID('dbo.Login_UpdateInactive', 'P') IS NULL THEN 0 ELSE 1 END AS hasUpdateInactiveProcedure;
  `);

  const hasClearProcedure = procedureCheck.recordset?.[0]?.hasClearProcedure === 1;
  const hasInsertProcedure = procedureCheck.recordset?.[0]?.hasInsertProcedure === 1;
  const hasUpdateInactiveProcedure = procedureCheck.recordset?.[0]?.hasUpdateInactiveProcedure === 1;

  if (hasClearProcedure && hasInsertProcedure && hasUpdateInactiveProcedure) {
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      await new sql.Request(transaction).execute("dbo.Login_Clear_UpdateInactive");

      for (const record of mappedRows) {
        await new sql.Request(transaction)
          .input("USER_CODE", sql.VarChar(50), record.userCode)
          .input("USERID", sql.Int, record.userId)
          .input("U_NAME", sql.VarChar(120), record.userName)
          .input("Active", sql.Bit, record.active)
          .execute("dbo.Login_Insert");
      }

      await new sql.Request(transaction).execute("dbo.Login_UpdateInactive");
      await transaction.commit();

      return {
        applied: true,
        processedCount: mappedRows.length,
        skippedCount: input.records.length - mappedRows.length,
        executionMode: "stored-procedure",
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  const fallbackReason =
    hasClearProcedure || hasInsertProcedure || hasUpdateInactiveProcedure
      ? "Login users stored procedure set was incomplete; fell back to direct SQL"
      : undefined;

  const tableCheck = await pool.request().query(`
    SELECT CASE WHEN OBJECT_ID('dbo.[Login]', 'U') IS NULL THEN 0 ELSE 1 END AS hasTable;
  `);

  if (tableCheck.recordset?.[0]?.hasTable !== 1) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "dbo.[Login] was not found in LOCAL_DB",
    };
  }

  const columnsResult = await pool.request().query(`
    SELECT [name]
    FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.[Login]', 'U');
  `);

  const availableColumns = new Set(
    (columnsResult.recordset ?? []).map((record) => String(record.name))
  );

  if (!availableColumns.has("UserID")) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "[Login] does not expose UserID, so legacy login user upsert cannot run",
    };
  }

  const hasId = availableColumns.has("Id");
  const hasUserName = availableColumns.has("UserName");
  const hasActive = availableColumns.has("Active");
  const hasImportStatus = availableColumns.has("ImportStatus");

  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    if (hasImportStatus) {
      await new sql.Request(transaction).query("UPDATE dbo.[Login] SET ImportStatus = 0;");
    }

    for (const record of mappedRows) {
      const updateParts: string[] = [];

      if (hasActive) {
        updateParts.push("[Active] = @Active");
      }

      if (hasUserName) {
        updateParts.push("[UserName] = @UserName");
      }

      if (hasId) {
        updateParts.push("[Id] = @Id");
      }

      if (hasImportStatus) {
        updateParts.push("[ImportStatus] = 1");
      }

      const updateAssignments =
        updateParts.length > 0 ? updateParts.join(",\n              ") : "[UserID] = [UserID]";

      const insertColumns = ["[UserID]"];
      const insertValues = ["@UserID"]; 

      if (hasId) {
        insertColumns.push("[Id]");
        insertValues.push("@Id");
      }

      if (hasUserName) {
        insertColumns.push("[UserName]");
        insertValues.push("@UserName");
      }

      if (hasActive) {
        // Mirror old Login_Insert: new rows are inserted as active.
        insertColumns.push("[Active]");
        insertValues.push("1");
      }

      if (hasImportStatus) {
        insertColumns.push("[ImportStatus]");
        insertValues.push("1");
      }

      await new sql.Request(transaction)
        .input("UserID", sql.VarChar(50), record.userCode)
        .input("Id", sql.Int, record.userId)
        .input("UserName", sql.VarChar(120), record.userName)
        .input("Active", sql.Bit, record.active)
        .query(`
          IF EXISTS (SELECT 1 FROM dbo.[Login] WHERE [UserID] = @UserID)
          BEGIN
            UPDATE dbo.[Login]
            SET
              ${updateAssignments}
            WHERE [UserID] = @UserID;
          END
          ELSE
          BEGIN
            INSERT INTO dbo.[Login] (
              ${insertColumns.join(",\n              ")}
            )
            VALUES (
              ${insertValues.join(",\n              ")}
            );
          END;
        `);
    }

    if (hasActive && hasImportStatus) {
      await new sql.Request(transaction).query(`
        IF OBJECT_ID('dbo.tabTransactionLog', 'U') IS NOT NULL
        BEGIN
          UPDATE loginUser
          SET [Active] = 0
          FROM dbo.[Login] loginUser
          WHERE loginUser.ImportStatus = 0
            AND loginUser.[UserName] IN (
              SELECT [User]
              FROM dbo.tabTransactionLog
            );
        END;

        UPDATE dbo.[Login]
        SET [ImportStatus] = 0;
      `);
    } else if (hasImportStatus) {
      await new sql.Request(transaction).query("UPDATE dbo.[Login] SET [ImportStatus] = 0;");
    }

    await transaction.commit();

    return {
      applied: true,
      processedCount: mappedRows.length,
      skippedCount: input.records.length - mappedRows.length,
      executionMode: "direct-sql",
      reason: combineReasons(
        fallbackReason,
        !hasActive
          ? "[Login] does not expose Active; inactive login users could not be marked"
          : undefined,
        hasActive && hasImportStatus && !hasUserName
          ? "[Login] does not expose UserName; tabTransactionLog-based inactivation could not run"
          : undefined
      ),
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function syncDistributionRulesToLegacyTable(input: {
  records: unknown[];
}): Promise<DistributionRuleLegacySyncResult> {
  if (!isLocalDbMasterDataWriteEnabled()) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "LOCAL_DB distribution rules sync is disabled",
    };
  }

  const mappedRows = input.records
    .map((record) => mapDistributionRuleLegacyRow(record))
    .filter((record): record is DistributionRuleLegacyRow => record !== null);

  if (mappedRows.length === 0) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "No distribution rule rows could be mapped to the legacy tblRefDistributionRule shape",
    };
  }

  await ensureSchema();
  const pool = await getPool();

  const procedureCheck = await pool.request().query(`
    SELECT
      CASE WHEN OBJECT_ID('dbo.tblRefDestributionRules_Clear_UpdateInactive', 'P') IS NULL THEN 0 ELSE 1 END AS hasClearProcedure,
      CASE WHEN OBJECT_ID('dbo.tblRefDestributionRules_Insert', 'P') IS NULL THEN 0 ELSE 1 END AS hasInsertProcedure,
      CASE WHEN OBJECT_ID('dbo.tblRefDestributionRules_UpdateInactive', 'P') IS NULL THEN 0 ELSE 1 END AS hasUpdateInactiveProcedure;
  `);

  const hasClearProcedure = procedureCheck.recordset?.[0]?.hasClearProcedure === 1;
  const hasInsertProcedure = procedureCheck.recordset?.[0]?.hasInsertProcedure === 1;
  const hasUpdateInactiveProcedure = procedureCheck.recordset?.[0]?.hasUpdateInactiveProcedure === 1;

  if (hasClearProcedure && hasInsertProcedure && hasUpdateInactiveProcedure) {
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      await new sql.Request(transaction).execute("dbo.tblRefDestributionRules_Clear_UpdateInactive");

      for (const record of mappedRows) {
        await new sql.Request(transaction)
          .input("OcrCode", sql.VarChar(20), record.ocrCode)
          .input("OcrName", sql.VarChar(100), record.ocrName)
          .input("RuleNo", sql.Int, record.ruleNo)
          .input("Active", sql.Bit, record.active)
          .execute("dbo.tblRefDestributionRules_Insert");
      }

      await new sql.Request(transaction).execute("dbo.tblRefDestributionRules_UpdateInactive");
      await transaction.commit();

      return {
        applied: true,
        processedCount: mappedRows.length,
        skippedCount: input.records.length - mappedRows.length,
        executionMode: "stored-procedure",
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  const fallbackReason =
    hasClearProcedure || hasInsertProcedure || hasUpdateInactiveProcedure
      ? "Distribution rules stored procedure set was incomplete; fell back to direct SQL"
      : undefined;

  const tableCheck = await pool.request().query(`
    SELECT CASE WHEN OBJECT_ID('dbo.tblRefDistributionRule', 'U') IS NULL THEN 0 ELSE 1 END AS hasTable;
  `);

  if (tableCheck.recordset?.[0]?.hasTable !== 1) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "dbo.tblRefDistributionRule was not found in LOCAL_DB",
    };
  }

  const columnsResult = await pool.request().query(`
    SELECT [name]
    FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.tblRefDistributionRule', 'U');
  `);

  const availableColumns = new Set(
    (columnsResult.recordset ?? []).map((record) => String(record.name))
  );

  const ruleKeyColumn = availableColumns.has("RuleNo")
    ? "RuleNo"
    : availableColumns.has("Level")
      ? "Level"
      : null;

  if (!availableColumns.has("OcrCode") || !ruleKeyColumn) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason:
        "tblRefDistributionRule does not expose OcrCode with RuleNo/Level, so legacy distribution rule upsert cannot run",
    };
  }

  const distributionRuleColumns = [
    { column: "OcrCode", param: "OcrCode" },
    { column: "OcrName", param: "OcrName" },
    { column: ruleKeyColumn, param: "RuleNo" },
    { column: "Status", param: "Status" },
  ].filter((entry) => availableColumns.has(entry.column));

  const hasStatus = availableColumns.has("Status");
  const hasImportStatus = availableColumns.has("ImportStatus");

  const updateParts = distributionRuleColumns
    .filter((entry) => entry.column !== "OcrCode" && entry.column !== ruleKeyColumn)
    .map((entry) => `[${entry.column}] = @${entry.param}`);

  if (hasImportStatus) {
    updateParts.push("[ImportStatus] = 1");
  }

  const updateAssignments =
    updateParts.length > 0
      ? updateParts.join(",\n              ")
      : `[${ruleKeyColumn}] = @RuleNo`;

  const insertColumns = distributionRuleColumns.map((entry) => `[${entry.column}]`);
  const insertValues = distributionRuleColumns.map((entry) => `@${entry.param}`);

  if (hasImportStatus) {
    insertColumns.push("[ImportStatus]");
    insertValues.push("1");
  }

  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    if (hasImportStatus) {
      await new sql.Request(transaction).query(
        "UPDATE dbo.tblRefDistributionRule SET ImportStatus = 0;"
      );
    }

    for (const record of mappedRows) {
      await new sql.Request(transaction)
        .input("OcrCode", sql.VarChar(20), record.ocrCode)
        .input("OcrName", sql.VarChar(100), record.ocrName)
        .input("RuleNo", sql.Int, record.ruleNo)
        .input("Status", sql.Bit, record.active)
        .query(`
          IF EXISTS (
            SELECT 1
            FROM dbo.tblRefDistributionRule
            WHERE OcrCode = @OcrCode AND [${ruleKeyColumn}] = @RuleNo
          )
          BEGIN
            UPDATE dbo.tblRefDistributionRule
            SET
              ${updateAssignments}
            WHERE OcrCode = @OcrCode AND [${ruleKeyColumn}] = @RuleNo;
          END
          ELSE
          BEGIN
            INSERT INTO dbo.tblRefDistributionRule (
              ${insertColumns.join(",\n              ")}
            )
            VALUES (
              ${insertValues.join(",\n              ")}
            );
          END;
        `);
    }

    if (hasStatus && hasImportStatus) {
      const distributionRuleReferences = [
        { table: "tblTransAPIssueDetails", columnPrefix: "DistRule" },
        { table: "tblTransGLIssueDetails", columnPrefix: "DistRule" },
        { table: "tblTransJobScheduleManager_Actuals", columnPrefix: "DistRule" },
        { table: "tblTransSupplierInvoiceDetails", columnPrefix: "DistRule" },
        { table: "tblTransIssueNoteDetails", columnPrefix: "DistRule" },
      ];

      for (const reference of distributionRuleReferences) {
        for (let level = 1; level <= 5; level += 1) {
          await new sql.Request(transaction).query(`
            IF OBJECT_ID('dbo.${reference.table}', 'U') IS NOT NULL
            BEGIN
              UPDATE distributionRule
              SET [Status] = 0
              FROM dbo.tblRefDistributionRule distributionRule
              WHERE distributionRule.ImportStatus = 0
                AND distributionRule.[${ruleKeyColumn}] = ${level}
                AND distributionRule.OcrCode IN (
                  SELECT ${reference.columnPrefix}${level}
                  FROM dbo.${reference.table}
                );
            END;
          `);
        }
      }
    }

    await transaction.commit();

    return {
      applied: true,
      processedCount: mappedRows.length,
      skippedCount: input.records.length - mappedRows.length,
      executionMode: "direct-sql",
      reason: combineReasons(
        fallbackReason,
        !hasStatus
          ? "tblRefDistributionRule does not expose Status; inactive rows could not be marked"
          : undefined,
        !hasImportStatus
          ? "tblRefDistributionRule does not expose ImportStatus; old distribution-rule inactive logic could not run"
          : undefined,
        ruleKeyColumn === "Level"
          ? "tblRefDistributionRule uses Level instead of RuleNo; fallback matched on Level"
          : undefined
      ),
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function syncWarehouseMasterToLegacyTable(input: {
  records: unknown[];
}): Promise<WarehouseMasterLegacySyncResult> {
  if (!isLocalDbMasterDataWriteEnabled()) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "LOCAL_DB warehouse sync is disabled",
    };
  }

  await ensureSchema();
  const pool = await getPool();
  const tableCheck = await pool.request().query(`
    SELECT CASE WHEN OBJECT_ID('dbo.tblWhseMst', 'U') IS NULL THEN 0 ELSE 1 END AS hasTable;
  `);

  if (tableCheck.recordset?.[0]?.hasTable !== 1) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "dbo.tblWhseMst was not found in LOCAL_DB",
    };
  }

  const mappedRows = input.records
    .map((record) => mapWarehouseMasterLegacyRow(record))
    .filter((record): record is WarehouseMasterLegacyRow => record !== null);

  if (mappedRows.length === 0) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "No warehouse rows could be mapped to the legacy tblWhseMst shape",
    };
  }

  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    await new sql.Request(transaction).query("UPDATE dbo.tblWhseMst SET ImportStatus = 0;");

    for (const record of mappedRows) {
      await new sql.Request(transaction)
        .input("WhseCode", sql.VarChar(20), record.warehouseCode)
        .input("WhseName", sql.VarChar(50), record.warehouseName)
        .input("WhseBranchCode", sql.VarChar(30), record.warehouseBranchCode)
        .input("WhseBankAccNum", sql.VarChar(30), record.warehouseBankAccNum)
        .input("Active", sql.Bit, record.active)
        .query(`
          IF EXISTS (SELECT 1 FROM dbo.tblWhseMst WHERE WhseCode = @WhseCode)
          BEGIN
            UPDATE dbo.tblWhseMst
            SET
              WhseName = @WhseName,
              WhseBranchCode = @WhseBranchCode,
              WhseBankAccNum = @WhseBankAccNum,
              Active = @Active,
              ImportStatus = 1
            WHERE WhseCode = @WhseCode;
          END
          ELSE
          BEGIN
            INSERT INTO dbo.tblWhseMst (
              WhseCode,
              WhseName,
              WhseBranchCode,
              WhseBankAccNum,
              Active,
              ImportStatus
            )
            VALUES (
              @WhseCode,
              @WhseName,
              @WhseBranchCode,
              @WhseBankAccNum,
              @Active,
              1
            );
          END
        `);
    }

    await new sql.Request(transaction).batch(`
      IF OBJECT_ID('dbo.tblTransEstimateDetail', 'U') IS NOT NULL
      BEGIN
        UPDATE dbo.tblWhseMst
        SET Active = 0
        WHERE WhseLink IN (SELECT WHLink FROM dbo.tblTransEstimateDetail)
          AND ImportStatus = 0;
      END;

      IF OBJECT_ID('dbo.tblTransBOMDetail', 'U') IS NOT NULL
      BEGIN
        UPDATE dbo.tblWhseMst
        SET Active = 0
        WHERE WhseLink IN (SELECT WHLink FROM dbo.tblTransBOMDetail)
          AND ImportStatus = 0;
      END;

      IF OBJECT_ID('dbo.tblTransCreditNoteItemDetails', 'U') IS NOT NULL
      BEGIN
        UPDATE dbo.tblWhseMst
        SET Active = 0
        WHERE WhseLink IN (SELECT WHLink FROM dbo.tblTransCreditNoteItemDetails)
          AND ImportStatus = 0;
      END;

      IF OBJECT_ID('dbo.tblTransInvoiceItemDetails', 'U') IS NOT NULL
      BEGIN
        UPDATE dbo.tblWhseMst
        SET Active = 0
        WHERE WhseLink IN (SELECT WHLink FROM dbo.tblTransInvoiceItemDetails)
          AND ImportStatus = 0;
      END;

      IF OBJECT_ID('dbo.tblTransIssueNoteDetails', 'U') IS NOT NULL
      BEGIN
        UPDATE dbo.tblWhseMst
        SET Active = 0
        WHERE WhseLink IN (SELECT WHLink FROM dbo.tblTransIssueNoteDetails)
          AND ImportStatus = 0;
      END;

      IF OBJECT_ID('dbo.tblTransRequestNoteDetails', 'U') IS NOT NULL
      BEGIN
        UPDATE dbo.tblWhseMst
        SET Active = 0
        WHERE WhseLink IN (SELECT WHLink FROM dbo.tblTransRequestNoteDetails)
          AND ImportStatus = 0;
      END;

      DELETE FROM dbo.tblWhseMst
      WHERE ImportStatus = 0
        AND ISNULL(Active, 0) = 0;
    `);

    await transaction.commit();

    return {
      applied: true,
      processedCount: mappedRows.length,
      skippedCount: input.records.length - mappedRows.length,
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function syncUomToLegacyTable(input: { records: unknown[] }): Promise<UomLegacySyncResult> {
  if (!isLocalDbMasterDataWriteEnabled()) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "LOCAL_DB UOM sync is disabled",
    };
  }

  await ensureSchema();
  const pool = await getPool();
  const tableCheck = await pool.request().query(`
    SELECT
      CASE WHEN OBJECT_ID('dbo.tblRefUnits', 'U') IS NULL THEN 0 ELSE 1 END AS hasTable,
      CASE WHEN COL_LENGTH('dbo.tblRefUnits', 'ImportStatus') IS NULL THEN 0 ELSE 1 END AS hasImportStatus,
      CASE WHEN COL_LENGTH('dbo.tblRefUnits', 'Status') IS NULL THEN 0 ELSE 1 END AS hasStatus;
  `);

  if (tableCheck.recordset?.[0]?.hasTable !== 1) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "dbo.tblRefUnits was not found in LOCAL_DB",
    };
  }

  const hasImportStatus = tableCheck.recordset?.[0]?.hasImportStatus === 1;
  const hasStatus = tableCheck.recordset?.[0]?.hasStatus === 1;

  const mappedRows = input.records
    .map((record) => mapUomLegacyRow(record))
    .filter((record): record is UomLegacyRow => record !== null);

  if (mappedRows.length === 0) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "No UOM rows could be mapped to the legacy tblRefUnits shape",
    };
  }

  const importStatusUpdateClause = hasImportStatus ? ", ImportStatus = 1" : "";
  const statusUpdateClause = hasStatus ? ", [Status] = 1" : "";
  const importStatusInsertColumns = hasImportStatus ? ", ImportStatus" : "";
  const statusInsertColumns = hasStatus ? ", [Status]" : "";
  const importStatusInsertValues = hasImportStatus ? ", 1" : "";
  const statusInsertValues = hasStatus ? ", 1" : "";

  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    if (hasImportStatus) {
      await new sql.Request(transaction).query("UPDATE dbo.tblRefUnits SET ImportStatus = 0;");
    }

    await new sql.Request(transaction).query(`
      CREATE TABLE #ImportedUnits (
        idUnits INT NOT NULL PRIMARY KEY
      );
    `);

    for (const record of mappedRows) {
      await new sql.Request(transaction)
        .input("idUnits", sql.Int, record.idUnits)
        .input("cUnitCode", sql.VarChar(100), record.unitCode)
        .input("cUnitDescription", sql.VarChar(100), record.unitDescription)
        .query(`
          IF EXISTS (SELECT 1 FROM dbo.tblRefUnits WHERE idUnits = @idUnits)
          BEGIN
            UPDATE dbo.tblRefUnits
            SET
              cUnitCode = @cUnitCode,
              cUnitDescription = @cUnitDescription,
              iUnitCategoryID = 0,
              bUnitRoundUp = 0${importStatusUpdateClause}${statusUpdateClause}
            WHERE idUnits = @idUnits;
          END
          ELSE
          BEGIN
            INSERT INTO dbo.tblRefUnits (
              idUnits,
              cUnitCode,
              cUnitDescription,
              iUnitCategoryID,
              bUnitRoundUp${importStatusInsertColumns}${statusInsertColumns}
            )
            VALUES (
              @idUnits,
              @cUnitCode,
              @cUnitDescription,
              0,
              0${importStatusInsertValues}${statusInsertValues}
            );
          END;

          IF NOT EXISTS (SELECT 1 FROM #ImportedUnits WHERE idUnits = @idUnits)
          BEGIN
            INSERT INTO #ImportedUnits (idUnits)
            VALUES (@idUnits);
          END;
        `);
    }

    if (hasStatus) {
      if (hasImportStatus) {
        await new sql.Request(transaction).query(`
          UPDATE dbo.tblRefUnits
          SET [Status] = 0
          WHERE ImportStatus = 0;
        `);
      } else {
        await new sql.Request(transaction).query(`
          UPDATE dbo.tblRefUnits
          SET [Status] = 0
          WHERE NOT EXISTS (
            SELECT 1
            FROM #ImportedUnits imported
            WHERE imported.idUnits = dbo.tblRefUnits.idUnits
          );
        `);
      }
    }

    await transaction.commit();

    return {
      applied: true,
      processedCount: mappedRows.length,
      skippedCount: input.records.length - mappedRows.length,
      reason:
        !hasImportStatus && !hasStatus
          ? "tblRefUnits does not expose ImportStatus or Status columns; only upsert behavior was applied"
          : !hasImportStatus
            ? "tblRefUnits does not expose ImportStatus; inactive rows were derived using imported idUnits"
            : undefined,
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function syncCurrencyMasterToLegacyTable(input: {
  records: unknown[];
}): Promise<CurrencyLegacySyncResult> {
  if (!isLocalDbMasterDataWriteEnabled()) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "LOCAL_DB currency sync is disabled",
    };
  }

  const mappedRows = input.records
    .map((record) => mapCurrencyLegacyRow(record))
    .filter((record): record is CurrencyLegacyRow => record !== null);

  if (mappedRows.length === 0) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "No currency rows could be mapped to the legacy tblRefCurrency shape",
    };
  }

  await ensureSchema();
  const pool = await getPool();
  const procedureCheck = await pool.request().query(`
    SELECT
      CASE WHEN OBJECT_ID('dbo.tblRefCurrency_Delete', 'P') IS NULL THEN 0 ELSE 1 END AS hasDeleteProcedure,
      CASE WHEN OBJECT_ID('dbo.tblRefCurrency_Insert', 'P') IS NULL THEN 0 ELSE 1 END AS hasInsertProcedure;
  `);

  const hasDeleteProcedure = procedureCheck.recordset?.[0]?.hasDeleteProcedure === 1;
  const hasInsertProcedure = procedureCheck.recordset?.[0]?.hasInsertProcedure === 1;

  if (hasDeleteProcedure && hasInsertProcedure) {
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      await new sql.Request(transaction).execute("dbo.tblRefCurrency_Delete");

      for (const record of mappedRows) {
        await new sql.Request(transaction)
          .input("SectionID", sql.Int, record.sectionId)
          .input("Currency", sql.VarChar(20), record.currency)
          .input("Description", sql.VarChar(500), record.description)
          .execute("dbo.tblRefCurrency_Insert");
      }

      await transaction.commit();

      return {
        applied: true,
        processedCount: mappedRows.length,
        skippedCount: input.records.length - mappedRows.length,
        executionMode: "stored-procedure",
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  const fallbackReason =
    hasDeleteProcedure || hasInsertProcedure
      ? "Currency sync stored procedure pair was incomplete; fell back to direct SQL"
      : undefined;

  const tableCheck = await pool.request().query(`
    SELECT
      CASE WHEN OBJECT_ID('dbo.tblRefCurrency', 'U') IS NULL THEN 0 ELSE 1 END AS hasCurrencyTable,
      CASE WHEN OBJECT_ID('dbo.tblRefCurrencyRate_Log', 'U') IS NULL THEN 0 ELSE 1 END AS hasCurrencyLogTable,
      CASE WHEN COL_LENGTH('dbo.tblRefCurrencyRate_Log', 'RateDate') IS NULL THEN 0 ELSE 1 END AS logHasRateDate,
      CASE WHEN COL_LENGTH('dbo.tblRefCurrencyRate_Log', 'SectionID') IS NULL THEN 0 ELSE 1 END AS logHasSectionID,
      CASE WHEN COL_LENGTH('dbo.tblRefCurrencyRate_Log', 'Currency') IS NULL THEN 0 ELSE 1 END AS logHasCurrency,
      CASE WHEN COL_LENGTH('dbo.tblRefCurrencyRate_Log', 'Description') IS NULL THEN 0 ELSE 1 END AS logHasDescription,
      CASE WHEN COL_LENGTH('dbo.tblRefCurrencyRate_Log', 'CurDate') IS NULL THEN 0 ELSE 1 END AS logHasCurDate;
  `);

  if (tableCheck.recordset?.[0]?.hasCurrencyTable !== 1) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "dbo.tblRefCurrency was not found in LOCAL_DB",
    };
  }

  const canWriteLog =
    tableCheck.recordset?.[0]?.hasCurrencyLogTable === 1 &&
    tableCheck.recordset?.[0]?.logHasRateDate === 1 &&
    tableCheck.recordset?.[0]?.logHasSectionID === 1 &&
    tableCheck.recordset?.[0]?.logHasCurrency === 1 &&
    tableCheck.recordset?.[0]?.logHasDescription === 1 &&
    tableCheck.recordset?.[0]?.logHasCurDate === 1;

  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    await new sql.Request(transaction).query("DELETE FROM dbo.tblRefCurrency;");

    for (const record of mappedRows) {
      await new sql.Request(transaction)
        .input("SectionID", sql.Int, record.sectionId)
        .input("Currency", sql.VarChar(20), record.currency)
        .input("Description", sql.VarChar(500), record.description)
        .query(`
          INSERT INTO dbo.tblRefCurrency (SectionID, Currency, Description)
          VALUES (@SectionID, @Currency, @Description);
        `);

      if (canWriteLog) {
        await new sql.Request(transaction)
          .input("SectionID", sql.Int, record.sectionId)
          .input("Currency", sql.VarChar(20), record.currency)
          .input("Description", sql.VarChar(500), record.description)
          .query(`
            INSERT INTO dbo.tblRefCurrencyRate_Log (RateDate, SectionID, Currency, Description, CurDate)
            VALUES (GETDATE(), @SectionID, @Currency, @Description, GETDATE());
          `);
      }
    }

    await transaction.commit();

    return {
      applied: true,
      processedCount: mappedRows.length,
      skippedCount: input.records.length - mappedRows.length,
      executionMode: "direct-sql",
      reason: combineReasons(
        fallbackReason,
        canWriteLog ? undefined : "tblRefCurrencyRate_Log was not available for currency log inserts"
      ),
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function syncCurrencyRatesToLegacyTable(input: {
  records: unknown[];
}): Promise<CurrencyLegacySyncResult> {
  if (!isLocalDbMasterDataWriteEnabled()) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "LOCAL_DB currency-rate sync is disabled",
    };
  }

  const mappedRows = input.records
    .map((record) => mapCurrencyRateLegacyRow(record))
    .filter((record): record is CurrencyRateLegacyRow => record !== null);

  if (mappedRows.length === 0) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "No currency-rate rows could be mapped to the legacy tblRefCurrencyRate shape",
    };
  }

  await ensureSchema();
  const pool = await getPool();
  const procedureCheck = await pool.request().query(`
    SELECT
      CASE WHEN OBJECT_ID('dbo.tblRefCurrencyRate_Delete', 'P') IS NULL THEN 0 ELSE 1 END AS hasDeleteProcedure,
      CASE WHEN OBJECT_ID('dbo.tblRefCurrencyRate_Insert', 'P') IS NULL THEN 0 ELSE 1 END AS hasInsertProcedure;
  `);

  const hasDeleteProcedure = procedureCheck.recordset?.[0]?.hasDeleteProcedure === 1;
  const hasInsertProcedure = procedureCheck.recordset?.[0]?.hasInsertProcedure === 1;

  if (hasDeleteProcedure && hasInsertProcedure) {
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      await new sql.Request(transaction).execute("dbo.tblRefCurrencyRate_Delete");

      for (const record of mappedRows) {
        await new sql.Request(transaction)
          .input("RateDate", sql.DateTime, record.rateDate)
          .input("Currency", sql.VarChar(20), record.currency)
          .input("Rate", sql.Numeric(18, 4), record.rate)
          .execute("dbo.tblRefCurrencyRate_Insert");
      }

      await transaction.commit();

      return {
        applied: true,
        processedCount: mappedRows.length,
        skippedCount: input.records.length - mappedRows.length,
        executionMode: "stored-procedure",
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  const fallbackReason =
    hasDeleteProcedure || hasInsertProcedure
      ? "Currency-rate sync stored procedure pair was incomplete; fell back to direct SQL"
      : undefined;

  const tableCheck = await pool.request().query(`
    SELECT
      CASE WHEN OBJECT_ID('dbo.tblRefCurrencyRate', 'U') IS NULL THEN 0 ELSE 1 END AS hasCurrencyRateTable,
      CASE WHEN OBJECT_ID('dbo.tblRefCurrencyRate_Log', 'U') IS NULL THEN 0 ELSE 1 END AS hasCurrencyLogTable,
      CASE WHEN COL_LENGTH('dbo.tblRefCurrencyRate_Log', 'RateDate') IS NULL THEN 0 ELSE 1 END AS logHasRateDate,
      CASE WHEN COL_LENGTH('dbo.tblRefCurrencyRate_Log', 'Currency') IS NULL THEN 0 ELSE 1 END AS logHasCurrency,
      CASE WHEN COL_LENGTH('dbo.tblRefCurrencyRate_Log', 'Rate') IS NULL THEN 0 ELSE 1 END AS logHasRate,
      CASE WHEN COL_LENGTH('dbo.tblRefCurrencyRate_Log', 'CurDate') IS NULL THEN 0 ELSE 1 END AS logHasCurDate;
  `);

  if (tableCheck.recordset?.[0]?.hasCurrencyRateTable !== 1) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "dbo.tblRefCurrencyRate was not found in LOCAL_DB",
    };
  }

  const canWriteLog =
    tableCheck.recordset?.[0]?.hasCurrencyLogTable === 1 &&
    tableCheck.recordset?.[0]?.logHasRateDate === 1 &&
    tableCheck.recordset?.[0]?.logHasCurrency === 1 &&
    tableCheck.recordset?.[0]?.logHasRate === 1 &&
    tableCheck.recordset?.[0]?.logHasCurDate === 1;

  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    await new sql.Request(transaction).query("DELETE FROM dbo.tblRefCurrencyRate;");

    for (const record of mappedRows) {
      await new sql.Request(transaction)
        .input("RateDate", sql.DateTime, record.rateDate)
        .input("Currency", sql.VarChar(20), record.currency)
        .input("Rate", sql.Numeric(18, 4), record.rate)
        .query(`
          INSERT INTO dbo.tblRefCurrencyRate (RateDate, Currency, Rate)
          VALUES (@RateDate, @Currency, @Rate);
        `);

      if (canWriteLog) {
        await new sql.Request(transaction)
          .input("RateDate", sql.DateTime, record.rateDate)
          .input("Currency", sql.VarChar(20), record.currency)
          .input("Rate", sql.Numeric(18, 4), record.rate)
          .query(`
            INSERT INTO dbo.tblRefCurrencyRate_Log (RateDate, Rate, Currency, CurDate)
            VALUES (@RateDate, @Rate, @Currency, GETDATE());
          `);
      }
    }

    await transaction.commit();

    return {
      applied: true,
      processedCount: mappedRows.length,
      skippedCount: input.records.length - mappedRows.length,
      executionMode: "direct-sql",
      reason: combineReasons(
        fallbackReason,
        canWriteLog ? undefined : "tblRefCurrencyRate_Log was not available for rate log inserts"
      ),
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function syncTaxCodesToLegacyTable(input: {
  records: unknown[];
}): Promise<TaxLegacySyncResult> {
  if (!isLocalDbMasterDataWriteEnabled()) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "LOCAL_DB tax-code sync is disabled",
    };
  }

  const mappedRows = input.records
    .map((record) => mapTaxCodeLegacyRow(record))
    .filter((record): record is TaxCodeLegacyRow => record !== null);

  if (mappedRows.length === 0) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "No tax-code rows could be mapped to the legacy tblRefVATCodes shape",
    };
  }

  await ensureSchema();
  const pool = await getPool();
  const procedureCheck = await pool.request().query(`
    SELECT
      CASE WHEN OBJECT_ID('dbo.tblRefVATCodes_Clear_UpdateInactive', 'P') IS NULL THEN 0 ELSE 1 END AS hasClearProcedure,
      CASE WHEN OBJECT_ID('dbo.tblRefVATCodes_Insert', 'P') IS NULL THEN 0 ELSE 1 END AS hasInsertProcedure,
      CASE WHEN OBJECT_ID('dbo.tblRefVATCodes_UpdateInactive', 'P') IS NULL THEN 0 ELSE 1 END AS hasUpdateInactiveProcedure;
  `);

  const hasClearProcedure = procedureCheck.recordset?.[0]?.hasClearProcedure === 1;
  const hasInsertProcedure = procedureCheck.recordset?.[0]?.hasInsertProcedure === 1;
  const hasUpdateInactiveProcedure = procedureCheck.recordset?.[0]?.hasUpdateInactiveProcedure === 1;

  if (hasClearProcedure && hasInsertProcedure && hasUpdateInactiveProcedure) {
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      await new sql.Request(transaction).execute("dbo.tblRefVATCodes_Clear_UpdateInactive");

      for (const record of mappedRows) {
        await new sql.Request(transaction)
          .input("VatCode", sql.VarChar(20), record.vatCode)
          .input("Description", sql.VarChar(sql.MAX), record.description)
          .input("Persenatge", sql.Numeric(18, 4), record.percentage)
          .input("isActive", sql.Bit, record.isActive)
          .input("TaxType", sql.VarChar(1), record.taxType)
          .execute("dbo.tblRefVATCodes_Insert");
      }

      await new sql.Request(transaction).execute("dbo.tblRefVATCodes_UpdateInactive");
      await transaction.commit();

      return {
        applied: true,
        processedCount: mappedRows.length,
        skippedCount: input.records.length - mappedRows.length,
        executionMode: "stored-procedure",
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  const fallbackReason =
    hasClearProcedure || hasInsertProcedure || hasUpdateInactiveProcedure
      ? "Tax-code stored procedure set was incomplete; fell back to direct SQL"
      : undefined;

  const tableCheck = await pool.request().query(`
    SELECT
      CASE WHEN OBJECT_ID('dbo.tblRefVATCodes', 'U') IS NULL THEN 0 ELSE 1 END AS hasTable,
      CASE WHEN COL_LENGTH('dbo.tblRefVATCodes', 'ImportStatus') IS NULL THEN 0 ELSE 1 END AS hasImportStatus,
      CASE WHEN COL_LENGTH('dbo.tblRefVATCodes', 'isActive') IS NULL THEN 0 ELSE 1 END AS hasIsActive,
      CASE WHEN COL_LENGTH('dbo.tblRefVATCodes', 'Type') IS NULL THEN 0 ELSE 1 END AS hasType,
      CASE WHEN COL_LENGTH('dbo.tblRefVATCodes', 'VATPcntage') IS NULL THEN 0 ELSE 1 END AS hasVatPercentage,
      CASE WHEN COL_LENGTH('dbo.tblRefVATCodes', 'IsNBT') IS NULL THEN 0 ELSE 1 END AS hasIsNBT;
  `);

  if (tableCheck.recordset?.[0]?.hasTable !== 1) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "dbo.tblRefVATCodes was not found in LOCAL_DB",
    };
  }

  const hasImportStatus = tableCheck.recordset?.[0]?.hasImportStatus === 1;
  const hasIsActive = tableCheck.recordset?.[0]?.hasIsActive === 1;
  const hasType = tableCheck.recordset?.[0]?.hasType === 1;
  const hasVatPercentage = tableCheck.recordset?.[0]?.hasVatPercentage === 1;
  const hasIsNBT = tableCheck.recordset?.[0]?.hasIsNBT === 1;

  const importStatusUpdateClause = hasImportStatus ? ", ImportStatus = 1" : "";
  const isActiveUpdateClause = hasIsActive ? ", isActive = @isActive" : "";
  const typeUpdateClause = hasType ? ", [Type] = @TaxType" : "";
  const vatPercentageUpdateClause = hasVatPercentage ? ", VATPcntage = @Persenatge" : "";
  const isNBTUpdateClause = hasIsNBT ? ", IsNBT = 0" : "";

  const importStatusInsertColumns = hasImportStatus ? ", ImportStatus" : "";
  const isActiveInsertColumns = hasIsActive ? ", isActive" : "";
  const typeInsertColumns = hasType ? ", [Type]" : "";
  const vatPercentageInsertColumns = hasVatPercentage ? ", VATPcntage" : "";
  const isNBTInsertColumns = hasIsNBT ? ", IsNBT" : "";

  const importStatusInsertValues = hasImportStatus ? ", 1" : "";
  const isActiveInsertValues = hasIsActive ? ", @isActive" : "";
  const typeInsertValues = hasType ? ", @TaxType" : "";
  const vatPercentageInsertValues = hasVatPercentage ? ", @Persenatge" : "";
  const isNBTInsertValues = hasIsNBT ? ", 0" : "";

  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    if (hasImportStatus) {
      await new sql.Request(transaction).query("UPDATE dbo.tblRefVATCodes SET ImportStatus = 0;");
    }

    await new sql.Request(transaction).query(`
      CREATE TABLE #ImportedVatCodes (
        VatCode VARCHAR(20) NOT NULL PRIMARY KEY
      );
    `);

    for (const record of mappedRows) {
      await new sql.Request(transaction)
        .input("VatCode", sql.VarChar(20), record.vatCode)
        .input("Description", sql.VarChar(sql.MAX), record.description)
        .input("Persenatge", sql.Numeric(18, 4), record.percentage)
        .input("isActive", sql.Bit, record.isActive)
        .input("TaxType", sql.VarChar(1), record.taxType)
        .query(`
          IF EXISTS (SELECT 1 FROM dbo.tblRefVATCodes WHERE VatCode = @VatCode)
          BEGIN
            UPDATE dbo.tblRefVATCodes
            SET
              Description = @Description,
              Persenatge = @Persenatge${isActiveUpdateClause}${importStatusUpdateClause}${typeUpdateClause}${vatPercentageUpdateClause}${isNBTUpdateClause}
            WHERE VatCode = @VatCode;
          END
          ELSE
          BEGIN
            INSERT INTO dbo.tblRefVATCodes (
              VatCode,
              Description,
              Persenatge${isActiveInsertColumns}${importStatusInsertColumns}${typeInsertColumns}${vatPercentageInsertColumns}${isNBTInsertColumns}
            )
            VALUES (
              @VatCode,
              @Description,
              @Persenatge${isActiveInsertValues}${importStatusInsertValues}${typeInsertValues}${vatPercentageInsertValues}${isNBTInsertValues}
            );
          END;

          IF NOT EXISTS (SELECT 1 FROM #ImportedVatCodes WHERE VatCode = @VatCode)
          BEGIN
            INSERT INTO #ImportedVatCodes (VatCode)
            VALUES (@VatCode);
          END;
        `);
    }

    if (hasIsActive) {
      if (hasImportStatus) {
        await new sql.Request(transaction).query(`
          UPDATE dbo.tblRefVATCodes
          SET isActive = 0
          WHERE ImportStatus = 0;
        `);
      } else {
        await new sql.Request(transaction).query(`
          UPDATE dbo.tblRefVATCodes
          SET isActive = 0
          WHERE NOT EXISTS (
            SELECT 1
            FROM #ImportedVatCodes imported
            WHERE imported.VatCode = dbo.tblRefVATCodes.VatCode
          );
        `);
      }
    }

    await transaction.commit();

    return {
      applied: true,
      processedCount: mappedRows.length,
      skippedCount: input.records.length - mappedRows.length,
      executionMode: "direct-sql",
      reason: combineReasons(
        fallbackReason,
        !hasIsActive
          ? "tblRefVATCodes does not expose isActive; inactive rows could not be marked"
          : !hasImportStatus
            ? "tblRefVATCodes does not expose ImportStatus; inactive rows were derived using imported VatCode values"
            : undefined
      ),
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function syncPeriodsToLegacyTable(input: {
  records: unknown[];
}): Promise<PeriodLegacySyncResult> {
  if (!isLocalDbMasterDataWriteEnabled()) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "LOCAL_DB periods sync is disabled",
    };
  }

  const mappedRows = input.records
    .map((record) => mapPeriodLegacyRow(record))
    .filter((record): record is PeriodLegacyRow => record !== null);

  if (mappedRows.length === 0) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "No period rows could be mapped to the legacy tblRefPeriods shape",
    };
  }

  await ensureSchema();
  const pool = await getPool();
  const procedureCheck = await pool.request().query(`
    SELECT
      CASE WHEN OBJECT_ID('dbo.tblRefPeriods_Insert', 'P') IS NULL THEN 0 ELSE 1 END AS hasInsertProcedure,
      CASE WHEN OBJECT_ID('dbo.tblRefPeriods_UpdateInactive', 'P') IS NULL THEN 0 ELSE 1 END AS hasUpdateInactiveProcedure;
  `);

  const hasInsertProcedure = procedureCheck.recordset?.[0]?.hasInsertProcedure === 1;
  const hasUpdateInactiveProcedure = procedureCheck.recordset?.[0]?.hasUpdateInactiveProcedure === 1;

  if (hasInsertProcedure && hasUpdateInactiveProcedure) {
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      for (const record of mappedRows) {
        await new sql.Request(transaction)
          .input("T_RefDate", sql.DateTime, record.endDate)
          .input("F_RefDate", sql.DateTime, record.startDate)
          .input("PeriodStat", sql.Bit, record.periodStat)
          .input("Code", sql.VarChar(50), record.periodCode)
          .input("Name", sql.VarChar(100), record.periodName)
          .execute("dbo.tblRefPeriods_Insert");
      }

      await new sql.Request(transaction).execute("dbo.tblRefPeriods_UpdateInactive");
      await transaction.commit();

      return {
        applied: true,
        processedCount: mappedRows.length,
        skippedCount: input.records.length - mappedRows.length,
        executionMode: "stored-procedure",
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  const fallbackReason =
    hasInsertProcedure || hasUpdateInactiveProcedure
      ? "Periods stored procedure set was incomplete; fell back to direct SQL"
      : undefined;

  const tableCheck = await pool.request().query(`
    SELECT
      CASE WHEN OBJECT_ID('dbo.tblRefPeriods', 'U') IS NULL THEN 0 ELSE 1 END AS hasTable,
      CASE WHEN COL_LENGTH('dbo.tblRefPeriods', 'Code') IS NULL THEN 0 ELSE 1 END AS hasCode,
      CASE WHEN COL_LENGTH('dbo.tblRefPeriods', 'Name') IS NULL THEN 0 ELSE 1 END AS hasName,
      CASE WHEN COL_LENGTH('dbo.tblRefPeriods', 'F_RefDate') IS NULL THEN 0 ELSE 1 END AS hasStartDate,
      CASE WHEN COL_LENGTH('dbo.tblRefPeriods', 'T_RefDate') IS NULL THEN 0 ELSE 1 END AS hasEndDate,
      CASE WHEN COL_LENGTH('dbo.tblRefPeriods', 'PeriodStat') IS NULL THEN 0 ELSE 1 END AS hasPeriodStat,
      CASE WHEN COL_LENGTH('dbo.tblRefPeriods', 'ImportStatus') IS NULL THEN 0 ELSE 1 END AS hasImportStatus;
  `);

  if (tableCheck.recordset?.[0]?.hasTable !== 1) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "dbo.tblRefPeriods was not found in LOCAL_DB",
    };
  }

  const hasCode = tableCheck.recordset?.[0]?.hasCode === 1;
  const hasName = tableCheck.recordset?.[0]?.hasName === 1;
  const hasStartDate = tableCheck.recordset?.[0]?.hasStartDate === 1;
  const hasEndDate = tableCheck.recordset?.[0]?.hasEndDate === 1;
  const hasPeriodStat = tableCheck.recordset?.[0]?.hasPeriodStat === 1;
  const hasImportStatus = tableCheck.recordset?.[0]?.hasImportStatus === 1;

  if (!hasStartDate || !hasEndDate || !hasPeriodStat) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "tblRefPeriods is missing one or more required columns: F_RefDate, T_RefDate, PeriodStat",
    };
  }

  const matchCondition = hasCode
    ? "Code = @Code"
    : "F_RefDate = @F_RefDate AND T_RefDate = @T_RefDate";
  const importedMatchCondition = hasCode
    ? "imported.Code = dbo.tblRefPeriods.Code"
    : "imported.F_RefDate = dbo.tblRefPeriods.F_RefDate AND imported.T_RefDate = dbo.tblRefPeriods.T_RefDate";
  const importStatusUpdateClause = hasImportStatus ? ", ImportStatus = 1" : "";
  const codeUpdateClause = hasCode ? ", Code = @Code" : "";
  const nameUpdateClause = hasName ? ", Name = @Name" : "";
  const codeInsertColumns = hasCode ? ", Code" : "";
  const nameInsertColumns = hasName ? ", Name" : "";
  const importStatusInsertColumns = hasImportStatus ? ", ImportStatus" : "";
  const codeInsertValues = hasCode ? ", @Code" : "";
  const nameInsertValues = hasName ? ", @Name" : "";
  const importStatusInsertValues = hasImportStatus ? ", 1" : "";

  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    if (hasImportStatus) {
      await new sql.Request(transaction).query("UPDATE dbo.tblRefPeriods SET ImportStatus = 0;");
    }

    await new sql.Request(transaction).query(`
      CREATE TABLE #ImportedPeriods (
        Code VARCHAR(50) NULL,
        F_RefDate DATETIME NOT NULL,
        T_RefDate DATETIME NOT NULL
      );
    `);

    for (const record of mappedRows) {
      await new sql.Request(transaction)
        .input("Code", sql.VarChar(50), record.periodCode)
        .input("Name", sql.VarChar(100), record.periodName)
        .input("F_RefDate", sql.DateTime, record.startDate)
        .input("T_RefDate", sql.DateTime, record.endDate)
        .input("PeriodStat", sql.Bit, record.periodStat)
        .query(`
          IF EXISTS (SELECT 1 FROM dbo.tblRefPeriods WHERE ${matchCondition})
          BEGIN
            UPDATE dbo.tblRefPeriods
            SET
              T_RefDate = @T_RefDate,
              F_RefDate = @F_RefDate,
              PeriodStat = @PeriodStat${codeUpdateClause}${nameUpdateClause}${importStatusUpdateClause}
            WHERE ${matchCondition};
          END
          ELSE
          BEGIN
            INSERT INTO dbo.tblRefPeriods (
              T_RefDate,
              F_RefDate,
              PeriodStat${codeInsertColumns}${nameInsertColumns}${importStatusInsertColumns}
            )
            VALUES (
              @T_RefDate,
              @F_RefDate,
              @PeriodStat${codeInsertValues}${nameInsertValues}${importStatusInsertValues}
            );
          END;

          INSERT INTO #ImportedPeriods (Code, F_RefDate, T_RefDate)
          VALUES (@Code, @F_RefDate, @T_RefDate);
        `);
    }

    if (hasImportStatus) {
      await new sql.Request(transaction).query(`
        UPDATE dbo.tblRefPeriods
        SET PeriodStat = 0
        WHERE ImportStatus = 0;
      `);
    } else {
      await new sql.Request(transaction).query(`
        UPDATE dbo.tblRefPeriods
        SET PeriodStat = 0
        WHERE NOT EXISTS (
          SELECT 1
          FROM #ImportedPeriods imported
          WHERE ${importedMatchCondition}
        );
      `);
    }

    await transaction.commit();

    return {
      applied: true,
      processedCount: mappedRows.length,
      skippedCount: input.records.length - mappedRows.length,
      executionMode: "direct-sql",
      reason: combineReasons(
        fallbackReason,
        !hasCode ? "tblRefPeriods does not expose Code; periods were matched by date range" : undefined,
        !hasImportStatus
          ? "tblRefPeriods does not expose ImportStatus; inactive rows were derived using imported period keys"
          : undefined
      ),
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function syncItemWarehousesToLegacyTable(input: {
  records: unknown[];
}): Promise<ItemWarehouseLegacySyncResult> {
  if (!isLocalDbMasterDataWriteEnabled()) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "LOCAL_DB item-warehouse sync is disabled",
    };
  }

  const candidateCount = input.records.reduce<number>(
    (total, record) => total + countItemWarehouseCandidates(record),
    0
  );

  const dedupedRows = new Map<string, ItemWarehouseLegacyRow>();
  for (const record of input.records) {
    for (const entry of mapItemWarehouseLegacyRows(record)) {
      dedupedRows.set(`${entry.itemCode}::${entry.warehouseCode}`, entry);
    }
  }

  const mappedRows = [...dedupedRows.values()];

  if (mappedRows.length === 0) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: candidateCount,
      reason: "No item-warehouse rows could be mapped to the legacy tblRefItem_WH shape",
    };
  }

  await ensureSchema();
  const pool = await getPool();
  const procedureCheck = await pool.request().query(`
    SELECT
      CASE WHEN OBJECT_ID('dbo.tblRefItem_WH_Clear_UpdateInactive', 'P') IS NULL THEN 0 ELSE 1 END AS hasClearProcedure,
      CASE WHEN OBJECT_ID('dbo.tblRefItem_WH_Insert', 'P') IS NULL THEN 0 ELSE 1 END AS hasInsertProcedure,
      CASE WHEN OBJECT_ID('dbo.tblRefItem_WH_UpdateInactive', 'P') IS NULL THEN 0 ELSE 1 END AS hasUpdateInactiveProcedure;
  `);

  const hasClearProcedure = procedureCheck.recordset?.[0]?.hasClearProcedure === 1;
  const hasInsertProcedure = procedureCheck.recordset?.[0]?.hasInsertProcedure === 1;
  const hasUpdateInactiveProcedure = procedureCheck.recordset?.[0]?.hasUpdateInactiveProcedure === 1;

  if (hasClearProcedure && hasInsertProcedure && hasUpdateInactiveProcedure) {
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      await new sql.Request(transaction).execute("dbo.tblRefItem_WH_Clear_UpdateInactive");

      for (const record of mappedRows) {
        await new sql.Request(transaction)
          .input("ItemCode", sql.VarChar(100), record.itemCode)
          .input("WHCode", sql.VarChar(100), record.warehouseCode)
          .input("QtyOnHand", sql.Numeric(18, 4), record.qtyOnHand)
          .input("idUnits", sql.Int, record.idUnits)
          .input("QtyOnOrder", sql.Numeric(18, 4), record.qtyOnOrder)
          .input("GLAccountSales", sql.VarChar(100), record.glAccountSales)
          .input("GLAccountCostOfSale", sql.VarChar(100), record.glAccountCostOfSale)
          .input("QtyOnAvailable", sql.Numeric(18, 4), record.qtyOnAvailable)
          .input("LastUnitCost", sql.Numeric(18, 4), record.lastUnitCost)
          .execute("dbo.tblRefItem_WH_Insert");
      }

      await new sql.Request(transaction).execute("dbo.tblRefItem_WH_UpdateInactive");
      await transaction.commit();

      return {
        applied: true,
        processedCount: mappedRows.length,
        skippedCount: Math.max(0, candidateCount - mappedRows.length),
        executionMode: "stored-procedure",
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  const fallbackReason =
    hasClearProcedure || hasInsertProcedure || hasUpdateInactiveProcedure
      ? "Item-warehouse stored procedure set was incomplete; fell back to direct SQL"
      : undefined;

  const tableCheck = await pool.request().query(`
    SELECT
      CASE WHEN OBJECT_ID('dbo.tblRefItem_WH', 'U') IS NULL THEN 0 ELSE 1 END AS hasItemWarehouseTable,
      CASE WHEN OBJECT_ID('dbo.tblRefItem', 'U') IS NULL THEN 0 ELSE 1 END AS hasItemTable,
      CASE WHEN OBJECT_ID('dbo.tblWhseMst', 'U') IS NULL THEN 0 ELSE 1 END AS hasWarehouseTable,
      CASE WHEN COL_LENGTH('dbo.tblRefItem_WH', 'StockLink') IS NULL THEN 0 ELSE 1 END AS hasStockLink,
      CASE WHEN COL_LENGTH('dbo.tblRefItem_WH', 'WhseLink') IS NULL THEN 0 ELSE 1 END AS hasWhseLink,
      CASE WHEN COL_LENGTH('dbo.tblRefItem_WH', 'QtyOnHand') IS NULL THEN 0 ELSE 1 END AS hasQtyOnHand,
      CASE WHEN COL_LENGTH('dbo.tblRefItem_WH', 'QtyOnOrder') IS NULL THEN 0 ELSE 1 END AS hasQtyOnOrder,
      CASE WHEN COL_LENGTH('dbo.tblRefItem_WH', 'QtyOnAvailable') IS NULL THEN 0 ELSE 1 END AS hasQtyOnAvailable,
      CASE WHEN COL_LENGTH('dbo.tblRefItem_WH', 'LastUnitCost') IS NULL THEN 0 ELSE 1 END AS hasLastUnitCost,
      CASE WHEN COL_LENGTH('dbo.tblRefItem_WH', 'Status') IS NULL THEN 0 ELSE 1 END AS hasStatus,
      CASE WHEN COL_LENGTH('dbo.tblRefItem_WH', 'ImportStatus') IS NULL THEN 0 ELSE 1 END AS hasImportStatus,
      CASE WHEN COL_LENGTH('dbo.tblRefItem_WH', 'idUnits') IS NULL THEN 0 ELSE 1 END AS hasIdUnits,
      CASE WHEN COL_LENGTH('dbo.tblRefItem_WH', 'GLAccountSales') IS NULL THEN 0 ELSE 1 END AS hasGlSales,
      CASE WHEN COL_LENGTH('dbo.tblRefItem_WH', 'GLAccountCostOfSale') IS NULL THEN 0 ELSE 1 END AS hasGlCost;
  `);

  if (tableCheck.recordset?.[0]?.hasItemWarehouseTable !== 1) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: candidateCount,
      reason: "dbo.tblRefItem_WH was not found in LOCAL_DB",
    };
  }

  if (tableCheck.recordset?.[0]?.hasItemTable !== 1 || tableCheck.recordset?.[0]?.hasWarehouseTable !== 1) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: candidateCount,
      reason: "dbo.tblRefItem or dbo.tblWhseMst was not found in LOCAL_DB",
    };
  }

  const hasStockLink = tableCheck.recordset?.[0]?.hasStockLink === 1;
  const hasWhseLink = tableCheck.recordset?.[0]?.hasWhseLink === 1;
  const hasQtyOnHand = tableCheck.recordset?.[0]?.hasQtyOnHand === 1;
  const hasQtyOnOrder = tableCheck.recordset?.[0]?.hasQtyOnOrder === 1;
  const hasQtyOnAvailable = tableCheck.recordset?.[0]?.hasQtyOnAvailable === 1;
  const hasLastUnitCost = tableCheck.recordset?.[0]?.hasLastUnitCost === 1;
  const hasStatus = tableCheck.recordset?.[0]?.hasStatus === 1;
  const hasImportStatus = tableCheck.recordset?.[0]?.hasImportStatus === 1;
  const hasIdUnits = tableCheck.recordset?.[0]?.hasIdUnits === 1;
  const hasGlSales = tableCheck.recordset?.[0]?.hasGlSales === 1;
  const hasGlCost = tableCheck.recordset?.[0]?.hasGlCost === 1;

  if (!hasStockLink || !hasWhseLink || !hasQtyOnHand || !hasQtyOnOrder || !hasQtyOnAvailable || !hasLastUnitCost || !hasStatus) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: candidateCount,
      reason:
        "tblRefItem_WH is missing one or more required columns: StockLink, WhseLink, QtyOnHand, QtyOnOrder, QtyOnAvailable, LastUnitCost, Status",
    };
  }

  const importStatusUpdateClause = hasImportStatus ? ", ImportStatus = 1" : "";
  const idUnitsUpdateClause = hasIdUnits ? ", idUnits = @idUnits" : "";
  const glSalesUpdateClause = hasGlSales ? ", GLAccountSales = @GLAccountSales" : "";
  const glCostUpdateClause = hasGlCost ? ", GLAccountCostOfSale = @GLAccountCostOfSale" : "";
  const idUnitsInsertColumns = hasIdUnits ? ", idUnits" : "";
  const glSalesInsertColumns = hasGlSales ? ", GLAccountSales" : "";
  const glCostInsertColumns = hasGlCost ? ", GLAccountCostOfSale" : "";
  const importStatusInsertColumns = hasImportStatus ? ", ImportStatus" : "";
  const idUnitsInsertValues = hasIdUnits ? ", @idUnits" : "";
  const glSalesInsertValues = hasGlSales ? ", @GLAccountSales" : "";
  const glCostInsertValues = hasGlCost ? ", @GLAccountCostOfSale" : "";
  const importStatusInsertValues = hasImportStatus ? ", 1" : "";

  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    if (hasImportStatus) {
      await new sql.Request(transaction).query("UPDATE dbo.tblRefItem_WH SET ImportStatus = 0;");
    }

    await new sql.Request(transaction).query(`
      UPDATE dbo.tblRefItem_WH
      SET QtyOnHand = 0.000, LastUnitCost = 0.00;
    `);

    await new sql.Request(transaction).query(`
      CREATE TABLE #ImportedItemWarehouses (
        StockLink INT NOT NULL,
        WhseLink INT NOT NULL,
        PRIMARY KEY (StockLink, WhseLink)
      );
    `);

    let unresolvedCount = 0;

    for (const record of mappedRows) {
      const resolvedLinks = await new sql.Request(transaction)
        .input("ItemCode", sql.VarChar(100), record.itemCode)
        .input("WHCode", sql.VarChar(100), record.warehouseCode)
        .query(`
          SELECT
            (SELECT TOP 1 StockLink FROM dbo.tblRefItem WHERE ItemCode = @ItemCode) AS StockLink,
            (SELECT TOP 1 WhseLink FROM dbo.tblWhseMst WHERE WhseCode = @WHCode) AS WhseLink;
        `);

      const stockLink = resolvedLinks.recordset?.[0]?.StockLink;
      const whseLink = resolvedLinks.recordset?.[0]?.WhseLink;

      if (!Number.isInteger(stockLink) || !Number.isInteger(whseLink)) {
        unresolvedCount += 1;
        continue;
      }

      await new sql.Request(transaction)
        .input("StockLink", sql.Int, stockLink)
        .input("WhseLink", sql.Int, whseLink)
        .input("QtyOnHand", sql.Numeric(18, 4), record.qtyOnHand)
        .input("idUnits", sql.Int, record.idUnits)
        .input("QtyOnOrder", sql.Numeric(18, 4), record.qtyOnOrder)
        .input("GLAccountSales", sql.VarChar(100), record.glAccountSales)
        .input("GLAccountCostOfSale", sql.VarChar(100), record.glAccountCostOfSale)
        .input("QtyOnAvailable", sql.Numeric(18, 4), record.qtyOnAvailable)
        .input("LastUnitCost", sql.Numeric(18, 4), record.lastUnitCost)
        .query(`
          IF EXISTS (SELECT 1 FROM dbo.tblRefItem_WH WHERE WhseLink = @WhseLink AND StockLink = @StockLink)
          BEGIN
            UPDATE dbo.tblRefItem_WH
            SET
              StockLink = @StockLink,
              WhseLink = @WhseLink,
              QtyOnHand = @QtyOnHand${idUnitsUpdateClause},
              QtyOnOrder = @QtyOnOrder${glSalesUpdateClause}${glCostUpdateClause},
              QtyOnAvailable = @QtyOnAvailable,
              LastUnitCost = @LastUnitCost,
              [Status] = 1${importStatusUpdateClause}
            WHERE WhseLink = @WhseLink AND StockLink = @StockLink;
          END
          ELSE
          BEGIN
            INSERT INTO dbo.tblRefItem_WH (
              [Status],
              LastUnitCost,
              StockLink,
              WhseLink,
              QtyOnHand${idUnitsInsertColumns},
              QtyOnOrder${glSalesInsertColumns}${glCostInsertColumns},
              QtyOnAvailable${importStatusInsertColumns}
            )
            VALUES (
              1,
              @LastUnitCost,
              @StockLink,
              @WhseLink,
              @QtyOnHand${idUnitsInsertValues},
              @QtyOnOrder${glSalesInsertValues}${glCostInsertValues},
              @QtyOnAvailable${importStatusInsertValues}
            );
          END;

          IF NOT EXISTS (
            SELECT 1 FROM #ImportedItemWarehouses WHERE StockLink = @StockLink AND WhseLink = @WhseLink
          )
          BEGIN
            INSERT INTO #ImportedItemWarehouses (StockLink, WhseLink)
            VALUES (@StockLink, @WhseLink);
          END;
        `);
    }

    const inactiveCondition = hasImportStatus
      ? "ImportStatus = 0"
      : "NOT EXISTS (SELECT 1 FROM #ImportedItemWarehouses imported WHERE imported.StockLink = dbo.tblRefItem_WH.StockLink AND imported.WhseLink = dbo.tblRefItem_WH.WhseLink)";

    await new sql.Request(transaction).batch(`
      IF OBJECT_ID('dbo.tblTransEstimateDetail', 'U') IS NOT NULL
      BEGIN
        UPDATE dbo.tblRefItem_WH
        SET [Status] = 0
        WHERE WhseLink IN (SELECT WHLink FROM dbo.tblTransEstimateDetail)
          AND ${inactiveCondition};
      END;

      IF OBJECT_ID('dbo.tblTransBOMDetail', 'U') IS NOT NULL
      BEGIN
        UPDATE dbo.tblRefItem_WH
        SET [Status] = 0
        WHERE WhseLink IN (SELECT WHLink FROM dbo.tblTransBOMDetail)
          AND ${inactiveCondition};
      END;

      IF OBJECT_ID('dbo.tblTransCreditNoteItemDetails', 'U') IS NOT NULL
      BEGIN
        UPDATE dbo.tblRefItem_WH
        SET [Status] = 0
        WHERE WhseLink IN (SELECT WHLink FROM dbo.tblTransCreditNoteItemDetails)
          AND ${inactiveCondition};
      END;

      IF OBJECT_ID('dbo.tblTransInvoiceItemDetails', 'U') IS NOT NULL
      BEGIN
        UPDATE dbo.tblRefItem_WH
        SET [Status] = 0
        WHERE WhseLink IN (SELECT WHLink FROM dbo.tblTransInvoiceItemDetails)
          AND ${inactiveCondition};
      END;

      IF OBJECT_ID('dbo.tblTransIssueNoteDetails', 'U') IS NOT NULL
      BEGIN
        UPDATE dbo.tblRefItem_WH
        SET [Status] = 0
        WHERE WhseLink IN (SELECT WHLink FROM dbo.tblTransIssueNoteDetails)
          AND ${inactiveCondition};
      END;

      IF OBJECT_ID('dbo.tblTransRequestNoteDetails', 'U') IS NOT NULL
      BEGIN
        UPDATE dbo.tblRefItem_WH
        SET [Status] = 0
        WHERE WhseLink IN (SELECT WHLink FROM dbo.tblTransRequestNoteDetails)
          AND ${inactiveCondition};
      END;
    `);

    await transaction.commit();

    const appliedCount = mappedRows.length - unresolvedCount;

    return {
      applied: true,
      processedCount: appliedCount,
      skippedCount: Math.max(0, candidateCount - appliedCount),
      executionMode: "direct-sql",
      reason: combineReasons(
        fallbackReason,
        unresolvedCount > 0
          ? `${unresolvedCount} item-warehouse row(s) were skipped because StockLink or WhseLink could not be resolved`
          : undefined,
        !hasImportStatus
          ? "tblRefItem_WH does not expose ImportStatus; inactive rows were derived using imported StockLink and WhseLink values"
          : undefined
      ),
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function syncCustomerCurrencyToLegacyTable(input: {
  records: unknown[];
}): Promise<CurrencyLegacySyncResult> {
  if (!isLocalDbMasterDataWriteEnabled()) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "LOCAL_DB customer-currency sync is disabled",
    };
  }

  const mappedRows = input.records
    .map((record) => mapCustomerCurrencyLegacyRow(record))
    .filter((record): record is CustomerCurrencyLegacyRow => record !== null);

  if (mappedRows.length === 0) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "No customer-currency rows could be mapped to the legacy tblRefCustomer_Currency shape",
    };
  }

  await ensureSchema();
  const pool = await getPool();
  const procedureCheck = await pool.request().query(`
    SELECT
      CASE WHEN OBJECT_ID('dbo.tblRefCustomer_Currency_Delete', 'P') IS NULL THEN 0 ELSE 1 END AS hasDeleteProcedure,
      CASE WHEN OBJECT_ID('dbo.tblRefCustomer_Currency_Insert', 'P') IS NULL THEN 0 ELSE 1 END AS hasInsertProcedure;
  `);

  const hasDeleteProcedure = procedureCheck.recordset?.[0]?.hasDeleteProcedure === 1;
  const hasInsertProcedure = procedureCheck.recordset?.[0]?.hasInsertProcedure === 1;

  if (hasDeleteProcedure && hasInsertProcedure) {
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      await new sql.Request(transaction).execute("dbo.tblRefCustomer_Currency_Delete");

      for (const record of mappedRows) {
        await new sql.Request(transaction)
          .input("Currency", sql.VarChar(50), record.currency)
          .input("CustCode", sql.VarChar(50), record.customerCode)
          .execute("dbo.tblRefCustomer_Currency_Insert");
      }

      await transaction.commit();

      return {
        applied: true,
        processedCount: mappedRows.length,
        skippedCount: input.records.length - mappedRows.length,
        executionMode: "stored-procedure",
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  const fallbackReason =
    hasDeleteProcedure || hasInsertProcedure
      ? "Customer-currency sync stored procedure pair was incomplete; fell back to direct SQL"
      : undefined;

  const tableCheck = await pool.request().query(`
    SELECT CASE WHEN OBJECT_ID('dbo.tblRefCustomer_Currency', 'U') IS NULL THEN 0 ELSE 1 END AS hasTable;
  `);

  if (tableCheck.recordset?.[0]?.hasTable !== 1) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "dbo.tblRefCustomer_Currency was not found in LOCAL_DB",
    };
  }

  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    await new sql.Request(transaction).query("DELETE FROM dbo.tblRefCustomer_Currency;");

    for (const record of mappedRows) {
      await new sql.Request(transaction)
        .input("Currency", sql.VarChar(50), record.currency)
        .input("CustCode", sql.VarChar(50), record.customerCode)
        .query(`
          INSERT INTO dbo.tblRefCustomer_Currency (Currency, CustCode)
          VALUES (@Currency, @CustCode);
        `);
    }

    await transaction.commit();

    return {
      applied: true,
      processedCount: mappedRows.length,
      skippedCount: input.records.length - mappedRows.length,
      executionMode: "direct-sql",
      reason: fallbackReason,
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function syncProjectToLegacyTable(input: {
  records: unknown[];
}): Promise<ProjectLegacySyncResult> {
  if (!isLocalDbMasterDataWriteEnabled()) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "LOCAL_DB project sync is disabled",
    };
  }

  const mappedRows = input.records
    .map((record) => mapProjectLegacyRow(record))
    .filter((record): record is ProjectLegacyRow => record !== null);

  if (mappedRows.length === 0) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "No project rows could be mapped to the legacy tblRefProject shape",
    };
  }

  await ensureSchema();
  const pool = await getPool();

  const procedureCheck = await pool.request().query(`
    SELECT
      CASE WHEN OBJECT_ID('dbo.tblRefProject_Clear_UpdateInactive', 'P') IS NULL THEN 0 ELSE 1 END AS hasClearProcedure,
      CASE WHEN OBJECT_ID('dbo.tblRefProject_Insert', 'P') IS NULL THEN 0 ELSE 1 END AS hasInsertProcedure,
      CASE WHEN OBJECT_ID('dbo.tblRefProject_UpdateInactive', 'P') IS NULL THEN 0 ELSE 1 END AS hasUpdateInactiveProcedure;
  `);

  const hasClearProcedure = procedureCheck.recordset?.[0]?.hasClearProcedure === 1;
  const hasInsertProcedure = procedureCheck.recordset?.[0]?.hasInsertProcedure === 1;
  const hasUpdateInactiveProcedure = procedureCheck.recordset?.[0]?.hasUpdateInactiveProcedure === 1;

  if (hasClearProcedure && hasInsertProcedure && hasUpdateInactiveProcedure) {
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      await new sql.Request(transaction).execute("dbo.tblRefProject_Clear_UpdateInactive");

      for (const record of mappedRows) {
        await new sql.Request(transaction)
          .input("ProjectCode", sql.VarChar(20), record.projectCode)
          .input("ProjectName", sql.VarChar(200), record.projectName)
          .input("ActiveProject", sql.Bit, record.activeProject)
          .execute("dbo.tblRefProject_Insert");
      }

      await new sql.Request(transaction).execute("dbo.tblRefProject_UpdateInactive");
      await transaction.commit();

      return {
        applied: true,
        processedCount: mappedRows.length,
        skippedCount: input.records.length - mappedRows.length,
        executionMode: "stored-procedure",
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  const fallbackReason =
    hasClearProcedure || hasInsertProcedure || hasUpdateInactiveProcedure
      ? "Project stored procedure set was incomplete; fell back to direct SQL"
      : undefined;

  const tableCheck = await pool.request().query(`
    SELECT CASE WHEN OBJECT_ID('dbo.tblRefProject', 'U') IS NULL THEN 0 ELSE 1 END AS hasTable;
  `);

  if (tableCheck.recordset?.[0]?.hasTable !== 1) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "dbo.tblRefProject was not found in LOCAL_DB",
    };
  }

  const columnsResult = await pool.request().query(`
    SELECT [name]
    FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.tblRefProject', 'U');
  `);

  const availableColumns = new Set(
    (columnsResult.recordset ?? []).map((record) => String(record.name))
  );

  const hasActiveProject = availableColumns.has("ActiveProject");
  const hasImportStatus = availableColumns.has("ImportStatus");

  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    if (hasImportStatus) {
      await new sql.Request(transaction).query("UPDATE dbo.tblRefProject SET ImportStatus = 0;");
    }

    for (const record of mappedRows) {
      await new sql.Request(transaction)
        .input("ProjectCode", sql.VarChar(20), record.projectCode)
        .input("ProjectName", sql.VarChar(200), record.projectName)
        .input("ActiveProject", sql.Bit, record.activeProject)
        .query(`
          IF EXISTS (SELECT 1 FROM dbo.tblRefProject WHERE ProjectCode = @ProjectCode)
          BEGIN
            UPDATE dbo.tblRefProject
            SET
              ProjectName = @ProjectName${hasActiveProject ? ", ActiveProject = @ActiveProject" : ""}${hasImportStatus ? ", ImportStatus = 1" : ""}
            WHERE ProjectCode = @ProjectCode;
          END
          ELSE
          BEGIN
            INSERT INTO dbo.tblRefProject (
              ProjectCode,
              ProjectName${hasActiveProject ? ", ActiveProject" : ""}${hasImportStatus ? ", ImportStatus" : ""}
            )
            VALUES (
              @ProjectCode,
              @ProjectName${hasActiveProject ? ", @ActiveProject" : ""}${hasImportStatus ? ", 1" : ""}
            );
          END;
        `);
    }

    if (hasImportStatus && hasActiveProject) {
      await new sql.Request(transaction).query(`
        UPDATE dbo.tblRefProject
        SET ActiveProject = 0
        WHERE ImportStatus = 0;
      `);
    }

    await transaction.commit();

    return {
      applied: true,
      processedCount: mappedRows.length,
      skippedCount: input.records.length - mappedRows.length,
      executionMode: "direct-sql",
      reason: combineReasons(
        fallbackReason,
        !hasActiveProject
          ? "tblRefProject does not expose ActiveProject; inactive rows could not be marked"
          : undefined,
        !hasImportStatus
          ? "tblRefProject does not expose ImportStatus; old project inactive logic could not run"
          : undefined
      ),
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function syncPriceListToLegacyTable(input: {
  records: unknown[];
}): Promise<PriceListLegacySyncResult> {
  if (!isLocalDbMasterDataWriteEnabled()) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "LOCAL_DB price-list sync is disabled",
    };
  }

  const mappedRows = input.records.flatMap((record) => mapPriceListLegacyRows(record));

  if (mappedRows.length === 0) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "No price-list rows could be mapped to the legacy tblRefPriceListPrices shape",
    };
  }

  await ensureSchema();
  const pool = await getPool();

  const procedureCheck = await pool.request().query(`
    SELECT CASE WHEN OBJECT_ID('dbo.tblRefPriceListPrices_insert', 'P') IS NULL THEN 0 ELSE 1 END AS hasInsertProcedure;
  `);

  const hasInsertProcedure = procedureCheck.recordset?.[0]?.hasInsertProcedure === 1;

  if (hasInsertProcedure) {
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      for (const record of mappedRows) {
        await new sql.Request(transaction)
          .input("ItemCode", sql.VarChar(100), record.itemCode)
          .input("Price", sql.Float, record.unitPrice)
          .input("ListName", sql.VarChar(100), record.priceListCode)
          .input("ProjectCode", sql.VarChar(20), record.listName)
          .execute("dbo.tblRefPriceListPrices_insert");
      }

      await transaction.commit();

      return {
        applied: true,
        processedCount: mappedRows.length,
        skippedCount: Math.max(0, input.records.length - mappedRows.length),
        executionMode: "stored-procedure",
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  const tableCheck = await pool.request().query(`
    SELECT CASE WHEN OBJECT_ID('dbo.tblRefPriceListPrices', 'U') IS NULL THEN 0 ELSE 1 END AS hasTable;
  `);

  if (tableCheck.recordset?.[0]?.hasTable !== 1) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "dbo.tblRefPriceListPrices was not found in LOCAL_DB",
    };
  }

  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    for (const record of mappedRows) {
      await new sql.Request(transaction)
        .input("ItemCode", sql.VarChar(100), record.itemCode)
        .input("Price", sql.Float, record.unitPrice)
        .input("PriceListCode", sql.VarChar(100), record.priceListCode)
        .input("ListName", sql.VarChar(100), record.listName)
        .query(`
          DECLARE @StockLink INT;
          SELECT @StockLink = stocklink FROM dbo.tblRefItem WHERE ItemCode = @ItemCode;

          IF @StockLink IS NOT NULL
          BEGIN
            IF EXISTS (
              SELECT 1
              FROM dbo.tblRefPriceListPrices
              WHERE iStockID = @StockLink
                AND PLName = @ListName
                AND iPriceListNameID = @PriceListCode
            )
            BEGIN
              UPDATE dbo.tblRefPriceListPrices
              SET fExclPrice = @Price
              WHERE iStockID = @StockLink
                AND PLName = @ListName
                AND iPriceListNameID = @PriceListCode;
            END
            ELSE
            BEGIN
              INSERT INTO dbo.tblRefPriceListPrices (ItemCode, fExclPrice, PLName, iStockID, iPriceListNameID)
              VALUES (@ItemCode, @Price, @ListName, @StockLink, @PriceListCode);
            END
          END;
        `);
    }

    await transaction.commit();

    return {
      applied: true,
      processedCount: mappedRows.length,
      skippedCount: Math.max(0, input.records.length - mappedRows.length),
      executionMode: "direct-sql",
      reason: "tblRefPriceListPrices_insert was not found; fell back to direct SQL",
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function syncItemToLegacyTable(input: {
  records: unknown[];
}): Promise<ItemLegacySyncResult> {
  if (!isLocalDbMasterDataWriteEnabled()) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "LOCAL_DB item sync is disabled",
    };
  }

  const mappedRows = input.records
    .map((record) => mapItemLegacyRow(record))
    .filter((record): record is ItemLegacyRow => record !== null);

  if (mappedRows.length === 0) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "No item rows could be mapped to the legacy tblRefItem shape",
    };
  }

  await ensureSchema();
  const pool = await getPool();

  const procedureCheck = await pool.request().query(`
    SELECT
      CASE WHEN OBJECT_ID('dbo.tblRefItem_Clear_UpdateInactive', 'P') IS NULL THEN 0 ELSE 1 END AS hasClearProcedure,
      CASE WHEN OBJECT_ID('dbo.tblRefItem_Insert', 'P') IS NULL THEN 0 ELSE 1 END AS hasInsertProcedure,
      CASE WHEN OBJECT_ID('dbo.tblRefItem_UpdateInactive', 'P') IS NULL THEN 0 ELSE 1 END AS hasUpdateInactiveProcedure;
  `);

  const hasClearProcedure = procedureCheck.recordset?.[0]?.hasClearProcedure === 1;
  const hasInsertProcedure = procedureCheck.recordset?.[0]?.hasInsertProcedure === 1;
  const hasUpdateInactiveProcedure = procedureCheck.recordset?.[0]?.hasUpdateInactiveProcedure === 1;

  if (hasClearProcedure && hasInsertProcedure && hasUpdateInactiveProcedure) {
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      await new sql.Request(transaction).execute("dbo.tblRefItem_Clear_UpdateInactive");

      for (const record of mappedRows) {
        await new sql.Request(transaction)
          .input("ItemCode", sql.VarChar(400), record.itemCode)
          .input("ItemClass", sql.VarChar(500), record.itemClass)
          .input("ItemDesc", sql.VarChar(500), record.itemDesc)
          .input("IsChargable", sql.Bit, record.isChargable)
          .input("idUnits", sql.Int, record.idUnits)
          .input("Date", sql.DateTime, record.date)
          .input("Status", sql.Bit, record.status)
          .input("QtyOnHand", sql.Numeric(18, 2), record.qtyOnHand)
          .input("QtyOnOrder", sql.Numeric(18, 2), record.qtyOnOrder)
          .input("QtyOnAvailable", sql.Numeric(18, 2), record.qtyOnAvailable)
          .input("LastUnitCost", sql.Numeric(18, 2), record.lastUnitCost)
          .input("ModelNo", sql.VarChar(500), record.modelNo)
          .input("GroupCode", sql.VarChar(500), record.groupCode)
          .input("IsServiceItem", sql.Bit, record.isServiceItem)
          .input("PackCode", sql.VarChar(500), record.packCode)
          .input("IsSerial", sql.Bit, record.isSerial)
          .input("UDF3", sql.VarChar(100), record.udf3)
          .input("UDF5", sql.VarChar(100), record.udf5)
          .input("Rate", sql.Numeric(18, 2), record.rate)
          .execute("dbo.tblRefItem_Insert");
      }

      await new sql.Request(transaction).execute("dbo.tblRefItem_UpdateInactive");
      await transaction.commit();

      return {
        applied: true,
        processedCount: mappedRows.length,
        skippedCount: input.records.length - mappedRows.length,
        executionMode: "stored-procedure",
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  const fallbackReason =
    hasClearProcedure || hasInsertProcedure || hasUpdateInactiveProcedure
      ? "Item stored procedure set was incomplete; fell back to direct SQL"
      : undefined;

  const tableCheck = await pool.request().query(`
    SELECT CASE WHEN OBJECT_ID('dbo.tblRefItem', 'U') IS NULL THEN 0 ELSE 1 END AS hasTable;
  `);

  if (tableCheck.recordset?.[0]?.hasTable !== 1) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "dbo.tblRefItem was not found in LOCAL_DB",
    };
  }

  const columnsResult = await pool.request().query(`
    SELECT [name]
    FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.tblRefItem', 'U');
  `);

  const availableColumns = new Set(
    (columnsResult.recordset ?? []).map((record) => String(record.name))
  );

  const hasImportStatus = availableColumns.has("ImportStatus");
  const hasStatus = availableColumns.has("Status");

  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    if (hasImportStatus) {
      await new sql.Request(transaction).query("UPDATE dbo.tblRefItem SET ImportStatus = 0;");
    }

    for (const record of mappedRows) {
      await new sql.Request(transaction)
        .input("ItemCode", sql.VarChar(400), record.itemCode)
        .input("ItemClass", sql.VarChar(500), record.itemClass)
        .input("ItemDesc", sql.VarChar(500), record.itemDesc)
        .input("idUnits", sql.Int, record.idUnits)
        .input("Date", sql.DateTime, record.date)
        .input("Status", sql.Bit, record.status)
        .input("QtyOnHand", sql.Numeric(18, 2), record.qtyOnHand)
        .input("QtyOnOrder", sql.Numeric(18, 2), record.qtyOnOrder)
        .input("QtyOnAvailable", sql.Numeric(18, 2), record.qtyOnAvailable)
        .input("LastUnitCost", sql.Numeric(18, 2), record.lastUnitCost)
        .input("ModelNo", sql.VarChar(500), record.modelNo)
        .input("GroupCode", sql.VarChar(500), record.groupCode)
        .input("IsServiceItem", sql.Bit, record.isServiceItem)
        .input("IsSerial", sql.Bit, record.isSerial)
        .input("UDF3", sql.VarChar(100), record.udf3)
        .input("UDF5", sql.VarChar(100), record.udf5)
        .input("Rate", sql.Numeric(18, 2), record.rate)
        .query(`
          IF EXISTS (SELECT 1 FROM dbo.tblRefItem WHERE ItemCode = @ItemCode)
          BEGIN
            UPDATE dbo.tblRefItem
            SET
              ItemClass = @ItemClass,
              ItemDesc = @ItemDesc,
              idUnits = @idUnits,
              [Date] = @Date${hasStatus ? ", [Status] = @Status" : ""},
              QtyOnHand = @QtyOnHand,
              QtyOnOrder = @QtyOnOrder,
              QtyOnAvailable = @QtyOnAvailable,
              LastUnitCost = @LastUnitCost,
              ModelNo = @ModelNo,
              GroupCode = @GroupCode,
              IsServiceItem = @IsServiceItem,
              IsSerial = @IsSerial,
              UDF3 = @UDF3,
              UDF5 = @UDF5,
              Rate = @Rate${hasImportStatus ? ", ImportStatus = 1" : ""}
            WHERE ItemCode = @ItemCode;
          END
          ELSE
          BEGIN
            INSERT INTO dbo.tblRefItem (
              ItemCode,
              ItemClass,
              ItemDesc,
              idUnits,
              [Date],
              QtyOnHand,
              QtyOnOrder,
              QtyOnAvailable,
              LastUnitCost,
              ModelNo,
              GroupCode,
              IsServiceItem,
              IsSerial,
              UDF3,
              UDF5,
              Rate${hasStatus ? ", [Status]" : ""}${hasImportStatus ? ", ImportStatus" : ""}
            )
            VALUES (
              @ItemCode,
              @ItemClass,
              @ItemDesc,
              @idUnits,
              @Date,
              @QtyOnHand,
              @QtyOnOrder,
              @QtyOnAvailable,
              @LastUnitCost,
              @ModelNo,
              @GroupCode,
              @IsServiceItem,
              @IsSerial,
              @UDF3,
              @UDF5,
              @Rate${hasStatus ? ", @Status" : ""}${hasImportStatus ? ", 1" : ""}
            );
          END;
        `);
    }

    if (hasStatus && hasImportStatus) {
      await new sql.Request(transaction).batch(`
        IF OBJECT_ID('dbo.tblTransEstimateDetail', 'U') IS NOT NULL
        BEGIN
          UPDATE dbo.tblRefItem
          SET [Status] = 0
          WHERE StockLink IN (SELECT StkLink FROM dbo.tblTransEstimateDetail)
            AND ImportStatus = 0;
        END;

        IF OBJECT_ID('dbo.tblTransBOMDetail', 'U') IS NOT NULL
        BEGIN
          UPDATE dbo.tblRefItem
          SET [Status] = 0
          WHERE StockLink IN (SELECT StkLink FROM dbo.tblTransBOMDetail)
            AND ImportStatus = 0;
        END;

        IF OBJECT_ID('dbo.tblTransCreditNoteItemDetails', 'U') IS NOT NULL
        BEGIN
          UPDATE dbo.tblRefItem
          SET [Status] = 0
          WHERE StockLink IN (SELECT StockLink FROM dbo.tblTransCreditNoteItemDetails)
            AND ImportStatus = 0;
        END;

        IF OBJECT_ID('dbo.tblTransInvoiceItemDetails', 'U') IS NOT NULL
        BEGIN
          UPDATE dbo.tblRefItem
          SET [Status] = 0
          WHERE StockLink IN (SELECT StockLink FROM dbo.tblTransInvoiceItemDetails)
            AND ImportStatus = 0;
        END;

        IF OBJECT_ID('dbo.tblTransIssueNoteDetails', 'U') IS NOT NULL
        BEGIN
          UPDATE dbo.tblRefItem
          SET [Status] = 0
          WHERE StockLink IN (SELECT StockLink FROM dbo.tblTransIssueNoteDetails)
            AND ImportStatus = 0;
        END;

        IF OBJECT_ID('dbo.tblTransRequestNoteDetails', 'U') IS NOT NULL
        BEGIN
          UPDATE dbo.tblRefItem
          SET [Status] = 0
          WHERE StockLink IN (SELECT StockLink FROM dbo.tblTransRequestNoteDetails)
            AND ImportStatus = 0;
        END;

        DELETE FROM dbo.tblRefItem
        WHERE ImportStatus = 0 AND ISNULL([Status], 0) = 0;
      `);
    }

    await transaction.commit();

    return {
      applied: true,
      processedCount: mappedRows.length,
      skippedCount: input.records.length - mappedRows.length,
      executionMode: "direct-sql",
      reason: combineReasons(
        fallbackReason,
        !hasStatus
          ? "tblRefItem does not expose Status; inactive rows could not be marked"
          : undefined,
        !hasImportStatus
          ? "tblRefItem does not expose ImportStatus; old item inactive logic could not run"
          : undefined
      ),
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function syncUomGroupToLegacyTable(input: {
  records: unknown[];
}): Promise<UomGroupLegacySyncResult> {
  if (!isLocalDbMasterDataWriteEnabled()) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "LOCAL_DB uom-group sync is disabled",
    };
  }

  const mappedRows = input.records
    .map((record) => mapUomGroupLegacyRow(record))
    .filter((record): record is UomGroupLegacyRow => record !== null);

  if (mappedRows.length === 0) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "No uom-group rows could be mapped to the legacy tblRefUOMGroup shape",
    };
  }

  await ensureSchema();
  const pool = await getPool();

  const procedureCheck = await pool.request().query(`
    SELECT
      CASE WHEN OBJECT_ID('dbo.tblRefUOMGroup_Delete', 'P') IS NULL THEN 0 ELSE 1 END AS hasDeleteProcedure,
      CASE WHEN OBJECT_ID('dbo.tblRefUOMGroup_Insert', 'P') IS NULL THEN 0 ELSE 1 END AS hasInsertProcedure;
  `);

  const hasDeleteProcedure = procedureCheck.recordset?.[0]?.hasDeleteProcedure === 1;
  const hasInsertProcedure = procedureCheck.recordset?.[0]?.hasInsertProcedure === 1;

  if (hasDeleteProcedure && hasInsertProcedure) {
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      await new sql.Request(transaction).execute("dbo.tblRefUOMGroup_Delete");

      for (const record of mappedRows) {
        await new sql.Request(transaction)
          .input("UgpEntry", sql.Int, record.ugpEntry)
          .input("UgpCode", sql.VarChar(50), record.ugpCode)
          .input("UgpName", sql.VarChar(50), record.ugpName)
          .input("BaseUom", sql.Int, record.baseUom)
          .execute("dbo.tblRefUOMGroup_Insert");
      }

      await transaction.commit();

      return {
        applied: true,
        processedCount: mappedRows.length,
        skippedCount: input.records.length - mappedRows.length,
        executionMode: "stored-procedure",
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  const tableCheck = await pool.request().query(`
    SELECT CASE WHEN OBJECT_ID('dbo.tblRefUOMGroup', 'U') IS NULL THEN 0 ELSE 1 END AS hasTable;
  `);

  if (tableCheck.recordset?.[0]?.hasTable !== 1) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "dbo.tblRefUOMGroup was not found in LOCAL_DB",
    };
  }

  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    await new sql.Request(transaction).query("DELETE FROM dbo.tblRefUOMGroup;");

    for (const record of mappedRows) {
      await new sql.Request(transaction)
        .input("UgpEntry", sql.Int, record.ugpEntry)
        .input("UgpCode", sql.VarChar(50), record.ugpCode)
        .input("UgpName", sql.VarChar(50), record.ugpName)
        .input("BaseUom", sql.Int, record.baseUom)
        .query(`
          INSERT INTO dbo.tblRefUOMGroup (UgpEntry, UgpCode, UgpName, BaseUom)
          VALUES (@UgpEntry, @UgpCode, @UgpName, @BaseUom);
        `);
    }

    await transaction.commit();

    return {
      applied: true,
      processedCount: mappedRows.length,
      skippedCount: input.records.length - mappedRows.length,
      executionMode: "direct-sql",
      reason:
        "tblRefUOMGroup_Delete/tblRefUOMGroup_Insert were not both found; fell back to direct SQL",
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function syncUomConversionToLegacyTable(input: {
  records: unknown[];
}): Promise<UomConversionLegacySyncResult> {
  if (!isLocalDbMasterDataWriteEnabled()) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "LOCAL_DB uom-conversion sync is disabled",
    };
  }

  const mapped = mapUomConversionLegacyRows(input.records);
  const conversions = mapped.conversions.filter(
    (entry): entry is UomConversionLegacyRow => entry.baseUom !== null
  );
  const formulas = mapped.formulas;

  if (conversions.length === 0 && formulas.length === 0) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "No uom-conversion rows could be mapped to the legacy conversion/formula shapes",
    };
  }

  await ensureSchema();
  const pool = await getPool();

  const procedureCheck = await pool.request().query(`
    SELECT
      CASE WHEN OBJECT_ID('dbo.tblRefUOMConverstion_Delete', 'P') IS NULL THEN 0 ELSE 1 END AS hasConversionDeleteProcedure,
      CASE WHEN OBJECT_ID('dbo.tblRefUOMConverstion_Insert', 'P') IS NULL THEN 0 ELSE 1 END AS hasConversionInsertProcedure,
      CASE WHEN OBJECT_ID('dbo.tblRefUOMFormula_Delete', 'P') IS NULL THEN 0 ELSE 1 END AS hasFormulaDeleteProcedure,
      CASE WHEN OBJECT_ID('dbo.tblRefUOMFormula_Insert', 'P') IS NULL THEN 0 ELSE 1 END AS hasFormulaInsertProcedure;
  `);

  const hasConversionDeleteProcedure =
    procedureCheck.recordset?.[0]?.hasConversionDeleteProcedure === 1;
  const hasConversionInsertProcedure =
    procedureCheck.recordset?.[0]?.hasConversionInsertProcedure === 1;
  const hasFormulaDeleteProcedure = procedureCheck.recordset?.[0]?.hasFormulaDeleteProcedure === 1;
  const hasFormulaInsertProcedure = procedureCheck.recordset?.[0]?.hasFormulaInsertProcedure === 1;

  if (
    hasConversionDeleteProcedure &&
    hasConversionInsertProcedure &&
    hasFormulaDeleteProcedure &&
    hasFormulaInsertProcedure
  ) {
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      await new sql.Request(transaction).execute("dbo.tblRefUOMConverstion_Delete");

      for (const record of conversions) {
        await new sql.Request(transaction)
          .input("BaseQty", sql.Float, record.baseQty)
          .input("UomEntry", sql.Int, record.uomEntry)
          .input("UgpCode", sql.VarChar(100), record.ugpCode)
          .input("UgpName", sql.VarChar(500), record.ugpName)
          .input("UomCode", sql.VarChar(100), record.uomCode)
          .input("UomName", sql.VarChar(500), record.uomName)
          .input("BaseUom", sql.Int, record.baseUom ?? 0)
          .execute("dbo.tblRefUOMConverstion_Insert");
      }

      await new sql.Request(transaction).execute("dbo.tblRefUOMFormula_Delete");

      for (const record of formulas) {
        await new sql.Request(transaction)
          .input("UgpEntry", sql.Int, record.ugpEntry)
          .input("BaseQty", sql.Float, record.baseQty)
          .input("UomEntry", sql.Int, record.uomEntry)
          .input("AltQty", sql.Float, record.altQty)
          .execute("dbo.tblRefUOMFormula_Insert");
      }

      await transaction.commit();

      return {
        applied: true,
        processedCount: conversions.length,
        skippedCount: Math.max(0, input.records.length - conversions.length),
        executionMode: "stored-procedure",
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    await new sql.Request(transaction).batch(`
      IF OBJECT_ID('dbo.tblRefUOMConverstion', 'U') IS NOT NULL
      BEGIN
        DELETE FROM dbo.tblRefUOMConverstion;
      END;

      IF OBJECT_ID('dbo.tblRefUOMFormula', 'U') IS NOT NULL
      BEGIN
        DELETE FROM dbo.tblRefUOMFormula;
      END;
    `);

    for (const record of conversions) {
      await new sql.Request(transaction)
        .input("BaseQty", sql.Float, record.baseQty)
        .input("UomEntry", sql.Int, record.uomEntry)
        .input("UgpCode", sql.VarChar(100), record.ugpCode)
        .input("UgpName", sql.VarChar(500), record.ugpName)
        .input("UomCode", sql.VarChar(100), record.uomCode)
        .input("UomName", sql.VarChar(500), record.uomName)
        .input("BaseUom", sql.Int, record.baseUom ?? 0)
        .query(`
          IF OBJECT_ID('dbo.tblRefUOMConverstion', 'U') IS NOT NULL AND @BaseUom IS NOT NULL
          BEGIN
            INSERT INTO dbo.tblRefUOMConverstion (BaseQty, UomEntry, UgpCode, UgpName, UomCode, UomName, BaseUom)
            VALUES (@BaseQty, @UomEntry, @UgpCode, @UgpName, @UomCode, @UomName, @BaseUom);
          END;
        `);
    }

    for (const record of formulas) {
      await new sql.Request(transaction)
        .input("UgpEntry", sql.Int, record.ugpEntry)
        .input("BaseQty", sql.Float, record.baseQty)
        .input("UomEntry", sql.Int, record.uomEntry)
        .input("AltQty", sql.Float, record.altQty)
        .query(`
          IF OBJECT_ID('dbo.tblRefUOMFormula', 'U') IS NOT NULL
          BEGIN
            INSERT INTO dbo.tblRefUOMFormula (UgpEntry, BaseQty, UomEntry, AltQty)
            VALUES (@UgpEntry, @BaseQty, @UomEntry, @AltQty);
          END;
        `);
    }

    await transaction.commit();

    return {
      applied: true,
      processedCount: conversions.length,
      skippedCount: Math.max(0, input.records.length - conversions.length),
      executionMode: "direct-sql",
      reason:
        "UOM conversion/formula stored procedure set was incomplete; fell back to direct SQL",
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function syncBankToLegacyTable(input: {
  records: unknown[];
}): Promise<BankLegacySyncResult> {
  if (!isLocalDbMasterDataWriteEnabled()) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "LOCAL_DB bank sync is disabled",
    };
  }

  const mappedRows = input.records
    .map((record) => mapBankLegacyRow(record))
    .filter((record): record is BankLegacyRow => record !== null);

  if (mappedRows.length === 0) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "No bank rows could be mapped to the legacy bank-branch shape",
    };
  }

  await ensureSchema();
  const pool = await getPool();

  const procedureCheck = await pool.request().query(`
    SELECT
      CASE WHEN OBJECT_ID('dbo.tblRefBank_Clear_UpdateInactive', 'P') IS NULL THEN 0 ELSE 1 END AS hasClearProcedure,
      CASE WHEN OBJECT_ID('dbo.tblRefBank_Insert', 'P') IS NULL THEN 0 ELSE 1 END AS hasInsertProcedure,
      CASE WHEN OBJECT_ID('dbo.tblRefBank_Insert_UpdateInactive', 'P') IS NULL THEN 0 ELSE 1 END AS hasUpdateInactiveProcedure;
  `);

  const hasClearProcedure = procedureCheck.recordset?.[0]?.hasClearProcedure === 1;
  const hasInsertProcedure = procedureCheck.recordset?.[0]?.hasInsertProcedure === 1;
  const hasUpdateInactiveProcedure = procedureCheck.recordset?.[0]?.hasUpdateInactiveProcedure === 1;

  if (hasClearProcedure && hasInsertProcedure && hasUpdateInactiveProcedure) {
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      await new sql.Request(transaction).execute("dbo.tblRefBank_Clear_UpdateInactive");

      for (const record of mappedRows) {
        await new sql.Request(transaction)
          .input("BankCode", sql.VarChar(50), record.bankCode)
          .input("BranchCode", sql.VarChar(50), record.branchCode)
          .input("BranchName", sql.VarChar(500), record.branchName)
          .input("Active", sql.Bit, record.active)
          .execute("dbo.tblRefBank_Insert");
      }

      await new sql.Request(transaction).execute("dbo.tblRefBank_Insert_UpdateInactive");
      await transaction.commit();

      return {
        applied: true,
        processedCount: mappedRows.length,
        skippedCount: input.records.length - mappedRows.length,
        executionMode: "stored-procedure",
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  const tableCheck = await pool.request().query(`
    SELECT CASE WHEN OBJECT_ID('dbo.tblRefBankBranches', 'U') IS NULL THEN 0 ELSE 1 END AS hasTable;
  `);

  if (tableCheck.recordset?.[0]?.hasTable !== 1) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "dbo.tblRefBankBranches was not found in LOCAL_DB",
    };
  }

  const columnsResult = await pool.request().query(`
    SELECT [name]
    FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.tblRefBankBranches', 'U');
  `);

  const availableColumns = new Set(
    (columnsResult.recordset ?? []).map((record) => String(record.name))
  );
  const hasImportStatus = availableColumns.has("ImportStatus");

  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    if (hasImportStatus) {
      await new sql.Request(transaction).query(
        "UPDATE dbo.tblRefBankBranches SET ImportStatus = 0;"
      );
    }

    for (const record of mappedRows) {
      await new sql.Request(transaction)
        .input("BankCode", sql.VarChar(50), record.bankCode)
        .input("BranchCode", sql.VarChar(50), record.branchCode)
        .input("BranchName", sql.VarChar(500), record.branchName)
        .input("Active", sql.Bit, record.active)
        .query(`
          IF EXISTS (
            SELECT 1 FROM dbo.tblRefBankBranches WHERE BankCode = @BankCode AND BranchCode = @BranchCode
          )
          BEGIN
            UPDATE dbo.tblRefBankBranches
            SET
              BranchName = @BranchName,
              Active = @Active${hasImportStatus ? ", ImportStatus = 1" : ""}
            WHERE BankCode = @BankCode AND BranchCode = @BranchCode;
          END
          ELSE
          BEGIN
            INSERT INTO dbo.tblRefBankBranches (
              BankCode,
              BranchCode,
              BranchName,
              Active${hasImportStatus ? ", ImportStatus" : ""}
            )
            VALUES (
              @BankCode,
              @BranchCode,
              @BranchName,
              @Active${hasImportStatus ? ", 1" : ""}
            );
          END;
        `);
    }

    await transaction.commit();

    return {
      applied: true,
      processedCount: mappedRows.length,
      skippedCount: input.records.length - mappedRows.length,
      executionMode: "direct-sql",
      reason:
        "tblRefBank_Clear_UpdateInactive/tblRefBank_Insert/tblRefBank_Insert_UpdateInactive were not all found; fell back to direct SQL",
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function syncBranchToLegacyTable(input: {
  records: unknown[];
}): Promise<BranchLegacySyncResult> {
  if (!isLocalDbMasterDataWriteEnabled()) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "LOCAL_DB branch sync is disabled",
    };
  }

  const mappedRows = input.records
    .map((record) => mapBranchLegacyRow(record))
    .filter((record): record is BranchLegacyRow => record !== null);

  if (mappedRows.length === 0) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "No branch rows could be mapped to the legacy tblRefBranch shape",
    };
  }

  await ensureSchema();
  const pool = await getPool();

  const procedureCheck = await pool.request().query(`
    SELECT
      CASE WHEN OBJECT_ID('dbo.tblRefBranch_Clear_UpdateInactive', 'P') IS NULL THEN 0 ELSE 1 END AS hasClearProcedure,
      CASE WHEN OBJECT_ID('dbo.tblRefBranch_Insert', 'P') IS NULL THEN 0 ELSE 1 END AS hasInsertProcedure,
      CASE WHEN OBJECT_ID('dbo.tblRefBranch_Insert_UpdateInactive', 'P') IS NULL THEN 0 ELSE 1 END AS hasUpdateInactiveProcedure;
  `);

  const hasClearProcedure = procedureCheck.recordset?.[0]?.hasClearProcedure === 1;
  const hasInsertProcedure = procedureCheck.recordset?.[0]?.hasInsertProcedure === 1;
  const hasUpdateInactiveProcedure = procedureCheck.recordset?.[0]?.hasUpdateInactiveProcedure === 1;

  if (hasClearProcedure && hasInsertProcedure && hasUpdateInactiveProcedure) {
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      await new sql.Request(transaction).execute("dbo.tblRefBranch_Clear_UpdateInactive");

      for (const record of mappedRows) {
        await new sql.Request(transaction)
          .input("BranchCode", sql.VarChar(50), record.branchCode)
          .input("BranchDes", sql.VarChar(100), record.branchDes)
          .input("Status", sql.Bit, record.status)
          .input("EnterUser", sql.VarChar(50), record.enterUser)
          .execute("dbo.tblRefBranch_Insert");
      }

      await new sql.Request(transaction).execute("dbo.tblRefBranch_Insert_UpdateInactive");
      await transaction.commit();

      return {
        applied: true,
        processedCount: mappedRows.length,
        skippedCount: input.records.length - mappedRows.length,
        executionMode: "stored-procedure",
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  const tableCheck = await pool.request().query(`
    SELECT CASE WHEN OBJECT_ID('dbo.tblRefBranch', 'U') IS NULL THEN 0 ELSE 1 END AS hasTable;
  `);

  if (tableCheck.recordset?.[0]?.hasTable !== 1) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "dbo.tblRefBranch was not found in LOCAL_DB",
    };
  }

  const columnsResult = await pool.request().query(`
    SELECT [name]
    FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.tblRefBranch', 'U');
  `);

  const availableColumns = new Set(
    (columnsResult.recordset ?? []).map((record) => String(record.name))
  );
  const hasImportStatus = availableColumns.has("ImportStatus");

  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    if (hasImportStatus) {
      await new sql.Request(transaction).query("UPDATE dbo.tblRefBranch SET ImportStatus = 0;");
    }

    for (const record of mappedRows) {
      await new sql.Request(transaction)
        .input("BranchCode", sql.VarChar(50), record.branchCode)
        .input("BranchDes", sql.VarChar(100), record.branchDes)
        .input("Status", sql.Bit, record.status)
        .input("EnterUser", sql.VarChar(50), record.enterUser)
        .query(`
          IF EXISTS (SELECT 1 FROM dbo.tblRefBranch WHERE BranchCode = @BranchCode)
          BEGIN
            UPDATE dbo.tblRefBranch
            SET
              BranchDes = @BranchDes,
              [Status] = @Status,
              EnterUser = @EnterUser,
              EnterDate = GETDATE()${hasImportStatus ? ", ImportStatus = 1" : ""}
            WHERE BranchCode = @BranchCode;
          END
          ELSE
          BEGIN
            INSERT INTO dbo.tblRefBranch (BranchCode, BranchDes, [Status], EnterUser, EnterDate${hasImportStatus ? ", ImportStatus" : ""})
            VALUES (@BranchCode, @BranchDes, @Status, @EnterUser, GETDATE()${hasImportStatus ? ", 1" : ""});
          END;
        `);
    }

    await transaction.commit();

    return {
      applied: true,
      processedCount: mappedRows.length,
      skippedCount: input.records.length - mappedRows.length,
      executionMode: "direct-sql",
      reason:
        "tblRefBranch_Clear_UpdateInactive/tblRefBranch_Insert/tblRefBranch_Insert_UpdateInactive were not all found; fell back to direct SQL",
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function syncSerialNumbersToLegacyTable(input: {
  records: unknown[];
}): Promise<SerialNumberLegacySyncResult> {
  if (!isLocalDbMasterDataWriteEnabled()) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "LOCAL_DB serial-number sync is disabled",
    };
  }

  const mappedRows = input.records
    .map((record) => mapSerialNumberLegacyRow(record))
    .filter((record): record is SerialNumberLegacyRow => record !== null);

  if (mappedRows.length === 0) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "No serial-number rows could be mapped to the legacy tblRefItem_SN shape",
    };
  }

  await ensureSchema();
  const pool = await getPool();

  const procedureCheck = await pool.request().query(`
    SELECT
      CASE WHEN OBJECT_ID('dbo.tblRefItem_SN_Delete', 'P') IS NULL THEN 0 ELSE 1 END AS hasDeleteProcedure,
      CASE WHEN OBJECT_ID('dbo.tblRefItem_SN_Insert', 'P') IS NULL THEN 0 ELSE 1 END AS hasInsertProcedure;
  `);

  const hasDeleteProcedure = procedureCheck.recordset?.[0]?.hasDeleteProcedure === 1;
  const hasInsertProcedure = procedureCheck.recordset?.[0]?.hasInsertProcedure === 1;

  if (hasDeleteProcedure && hasInsertProcedure) {
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      await new sql.Request(transaction).execute("dbo.tblRefItem_SN_Delete");

      for (const record of mappedRows) {
        await new sql.Request(transaction)
          .input("ItemCode", sql.VarChar(100), record.itemCode)
          .input("WHCode", sql.VarChar(100), record.whCode)
          .input("Quantity", sql.Float, record.quantity)
          .input("SN", sql.VarChar(500), record.sn)
          .execute("dbo.tblRefItem_SN_Insert");
      }

      await transaction.commit();

      return {
        applied: true,
        processedCount: mappedRows.length,
        skippedCount: input.records.length - mappedRows.length,
        executionMode: "stored-procedure",
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  const tableCheck = await pool.request().query(`
    SELECT CASE WHEN OBJECT_ID('dbo.tblRefItem_SN', 'U') IS NULL THEN 0 ELSE 1 END AS hasTable;
  `);

  if (tableCheck.recordset?.[0]?.hasTable !== 1) {
    return {
      applied: false,
      processedCount: 0,
      skippedCount: input.records.length,
      reason: "dbo.tblRefItem_SN was not found in LOCAL_DB",
    };
  }

  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    await new sql.Request(transaction).query("DELETE FROM dbo.tblRefItem_SN;");

    for (const record of mappedRows) {
      await new sql.Request(transaction)
        .input("ItemCode", sql.VarChar(100), record.itemCode)
        .input("WHCode", sql.VarChar(100), record.whCode)
        .input("Quantity", sql.Float, record.quantity)
        .input("SN", sql.VarChar(500), record.sn)
        .query(`
          DECLARE @StockLink INT, @WHLink INT;
          SELECT @StockLink = stocklink FROM dbo.tblRefItem WHERE ItemCode = @ItemCode;
          SELECT @WHLink = WhseLink FROM dbo.tblWhseMst WHERE WhseCode = @WHCode;

          IF @StockLink IS NOT NULL AND @WHLink IS NOT NULL
          BEGIN
            IF EXISTS (
              SELECT 1
              FROM dbo.tblRefItem_SN
              WHERE StockLink = @StockLink AND WHLink = @WHLink AND SN = @SN
            )
            BEGIN
              UPDATE dbo.tblRefItem_SN
              SET Quantity = @Quantity
              WHERE StockLink = @StockLink AND WHLink = @WHLink AND SN = @SN;
            END
            ELSE
            BEGIN
              INSERT INTO dbo.tblRefItem_SN (StockLink, WHLink, SN, Quantity)
              VALUES (@StockLink, @WHLink, @SN, @Quantity);
            END
          END;
        `);
    }

    await transaction.commit();

    return {
      applied: true,
      processedCount: mappedRows.length,
      skippedCount: input.records.length - mappedRows.length,
      executionMode: "direct-sql",
      reason: "tblRefItem_SN_Delete/tblRefItem_SN_Insert were not both found; fell back to direct SQL",
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function getMasterDataRawFromDb(input: {
  key: string;
  limit: number;
  transactionId?: string;
}): Promise<
  Array<{
    id: number;
    transactionId: string;
    masterKey: string;
    sourcePath: string;
    payloadJson: string;
    createdAt: string;
  }>
> {
  if (!isLocalDbEnabled()) {
    return [];
  }

  await ensureSchema();
  const pool = await getPool();
  const safeLimit = Math.min(Math.max(input.limit, 1), 1000);

  const request = pool
    .request()
    .input("TopN", sql.Int, safeLimit)
    .input("MasterKey", sql.NVarChar(120), input.key);

  if (input.transactionId) {
    request.input("TransactionId", sql.NVarChar(64), input.transactionId);
  }

  const result = await request.query(`
    SELECT TOP (@TopN)
      Id AS id,
      TransactionId AS transactionId,
      MasterKey AS masterKey,
      SourcePath AS sourcePath,
      PayloadJson AS payloadJson,
      CONVERT(NVARCHAR(33), CreatedAt, 127) AS createdAt
    FROM dbo.SyncMasterDataRaw
    WHERE MasterKey = @MasterKey
      ${input.transactionId ? "AND TransactionId = @TransactionId" : ""}
    ORDER BY CreatedAt DESC;
  `);

  return result.recordset as Array<{
    id: number;
    transactionId: string;
    masterKey: string;
    sourcePath: string;
    payloadJson: string;
    createdAt: string;
  }>;
}

export async function executeStoredProcedureOnLocalDb(
  procedureName: string,
  params?: Array<{ name: string; value: unknown }>
): Promise<Array<Record<string, unknown>>> {
  if (!isLocalDbEnabled()) {
    throw new Error("LOCAL_DB_ENABLED is false");
  }

  if (!procedureName || procedureName.trim().length === 0) {
    throw new Error("Stored procedure name is required");
  }

  const pool = await getPool();
  const request = pool.request();

  (params ?? []).forEach((param) => {
    request.input(param.name, param.value as string | number | boolean | Date | null);
  });

  const result = await request.execute(procedureName);
  return (result.recordset ?? []) as Array<Record<string, unknown>>;
}
