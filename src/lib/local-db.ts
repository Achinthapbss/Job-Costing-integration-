import sql, { config as SqlConfig } from "mssql";

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
  countItemWarehouseCandidates,
  ItemWarehouseLegacyRow,
  mapItemWarehouseLegacyRows,
} from "@/lib/item-warehouse-master";
import { mapPeriodLegacyRow, PeriodLegacyRow } from "@/lib/period-master";
import { mapTaxCodeLegacyRow, TaxCodeLegacyRow } from "@/lib/tax-master";
import { mapUomLegacyRow, UomLegacyRow } from "@/lib/uom-master";
import { mapWarehouseMasterLegacyRow, WarehouseMasterLegacyRow } from "@/lib/warehouse-master";

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

export interface CustomerLegacySyncResult {
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
