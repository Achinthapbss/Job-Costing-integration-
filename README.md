# Job Costing Integration

This repository contains the SAP job costing integration app built with Next.js API routes.

It provides:
- SAP Service Layer session/login handling.
- Generic pass-through API for GET/POST/PUT/PATCH/DELETE.
- Master-data sync endpoints mapped to your legacy methods.
- Optional direct POST of selected master modules to SAP Service Layer.

## 1. Setup

1. Copy environment template:

```bash
cp .env.example .env.local
```

2. Update `.env.local` values:
- `SAP_SERVICE_LAYER_BASE_URL`
- `SAP_COMPANY_DB`
- `SAP_USERNAME`
- `SAP_PASSWORD`
- `TARGET_SYSTEM_BASE_URL` (optional, where synced data should be posted)
- `TARGET_SYSTEM_API_KEY` (optional)
- `MASTER_POST_TO_SAP_ENABLED` (optional, default false)

3. Install and run:

```bash
npm install
npm run dev
```

## 1.1 Runtime Layout

This project is normally deployed as 3 separate processes:

- API app: the Next.js server that exposes `/api/master/*`, `/api/transactions/*`, `/api/logs`, and `/api/local-db/*`
- Master service: a background worker that calls `POST /api/master/jobs/legacy-core` on a schedule
- Transaction service: a background worker that calls `POST /api/transactions/jobs/legacy-full` on a schedule

Recommended separation:

- Keep the API app as the single integration entry point
- Run the master worker as its own service so master-data sync timing is independent
- Run the transaction worker as its own service so posting retries and transaction volume do not block master syncs

The master and transaction workers do not replace the API app. They call the API app over HTTP using `INTEGRATION_BASE_URL`.

## 1.2 Service Setup

Production-style setup usually looks like this:

1. API app

```bash
npm install
npm run build
npm run start
```

2. Master service

```bash
npm run service:master:install
copy services\master-service\.env.example services\master-service\.env
npm run service:master:start
```

3. Transaction service

```bash
npm run service:transaction:install
copy services\transaction-service\.env.example services\transaction-service\.env
npm run service:transaction:start
```

Minimum worker env values:

- `INTEGRATION_BASE_URL`: URL of the running API app, for example `http://localhost:3000`
- Master worker: `MASTER_JOB_INTERVAL_SECONDS`, `MASTER_JOB_DRY_RUN`, `MASTER_JOB_CONTINUE_ON_ERROR`
- Transaction worker: `TRANSACTION_JOB_INTERVAL_SECONDS`, `TRANSACTION_JOB_DRY_RUN`, `TRANSACTION_JOB_CONTINUE_ON_ERROR`, `TRANSACTION_JOB_USE_PENDING_FROM_LOCAL_DB`

Notes:

- If the services run on a different machine, set `INTEGRATION_BASE_URL` to the reachable API host, not `localhost`
- If `LOCAL_DB_ENABLED=false` in the API app, set `TRANSACTION_JOB_USE_PENDING_FROM_LOCAL_DB=false` in the transaction worker
- Leave `TRANSACTION_JOB_MAX_RECORDS` empty, or omit `maxRecords` in API calls, to process all available rows
- For smoke tests, both workers support `npm run start:once` inside their own service folders

## 2. Main APIs

### Health
- `GET /api/health`

### Master endpoint list
- `GET /api/master/endpoints`

### Master-data sync
- `POST /api/master/sync/:key`
- Body:

```json
{
	"dryRun": true,
	"query": "?$top=100",
	"targetOverridePath": "/master/customer"
}
```

### Legacy batch job (old button35 flow)
- `GET /api/master/jobs/legacy-core`
- `POST /api/master/jobs/legacy-core`
- Body:

```json
{
	"dryRun": true,
	"continueOnError": true
}
```

Sequence used:
- `item`
- `item-group`
- `item-group-accounts`
- `warehouse-master`
- `item-warehouses`
- `uom-group`

### Currency batch job (old button2 flow)
- `GET /api/master/jobs/currency`
- `POST /api/master/jobs/currency`
- Body:

```json
{
	"dryRun": true,
	"continueOnError": true
}
```

Sequence used:
- `currency`
- `currency-rates`
- `customer-currencies`

### Full master batch
- `GET /api/master/jobs/full`
- `POST /api/master/jobs/full`
- Body:

```json
{
	"dryRun": true,
	"continueOnError": true
}
```

Sequence used:
- `item`
- `item-group`
- `item-group-accounts`
- `warehouse-master`
- `item-warehouses`
- `uom-group`
- `currency`
- `currency-rates`
- `customer-currencies`

### SAP pass-through
- `GET|POST|PUT|PATCH|DELETE /api/service-layer/*`
- Example:

```http
GET /api/service-layer/BusinessPartners?$top=10
```

### Transaction endpoint map
- `GET /api/transactions/endpoints`

### Run single transaction post
- `POST /api/transactions/post/:key`
- Body:

```json
{
	"dryRun": true,
	"continueOnError": true,
	"usePendingFromLocalDb": true,
	"payloads": []
}
```

Implemented exact document payload builders (first set):
- `inventory-issue` -> SAP `/InventoryGenExits` payload with `DocumentLines`
- `inventory-return` -> SAP `/InventoryGenEntries` payload with `DocumentLines`
- `inventory-transfer` -> SAP `/StockTransfers` payload with `StockTransferLines`
- `supplier-invoice` -> SAP `/PurchaseInvoices` payload with `DocumentLines`
- `supplier-return` -> SAP `/PurchaseCreditNotes` payload with `DocumentLines`
- `customer-invoice` -> SAP `/Invoices` payload with `DocumentLines`
- `customer-credit-note` -> SAP `/CreditNotes` payload with `DocumentLines`
- `purchase-request` -> SAP `/PurchaseRequests` payload with `DocumentLines`
- `project-posting` -> SAP `/Projects` payload
- `gl-issue`, `gl-return`, `labour-issue`, `labour-return`, `machine-issue`, `machine-return` -> SAP `/JournalEntries` payload with `JournalEntryLines`
- `subcon-mobilization`, `subcon-retention`, `customer-mobilization`, `customer-retention` -> SAP down-payment payloads for `/PurchaseDownPayments` or `/DownPayments`
- `subcon-invoice`, `subcon-return` -> SAP purchase marketing docs via `/PurchaseInvoices` and `/PurchaseCreditNotes`

Builder source:
- `src/lib/transaction-payload-builders.ts`

### Run legacy full transaction batch (old button34 flow)
- `GET /api/transactions/jobs/legacy-full`
- `POST /api/transactions/jobs/legacy-full`
- Body:

```json
{
	"dryRun": true,
	"continueOnError": true,
	"usePendingFromLocalDb": true,
}
```

### Local database verification
- `GET /api/local-db/health`
- `GET /api/local-db/transactions?limit=20`
- `GET /api/local-db/master-data?key=customer&limit=50`

## 3. Master Keys (Legacy .NET Mapping)

The endpoint `GET /api/master/endpoints` returns all keys and notes. Keys include:

- `price-list`
- `periods`
- `customer`
- `currency-rates`
- `item`
- `item-warehouses`
- `warehouse-master`
- `sales-rep`
- `project`
- `uom`
- `uom-conversion`
- `uom-group`
- `vendor`
- `distribution-rules`
- `accounts`
- `tax-codes`
- `login-users`
- `bank`
- `branch`
- `serial-numbers`
- `item-group`
- `item-group-accounts`

### Coverage Checklist

Master Modules covered:
- Price List
- Periods
- Customers
- Currency Rates
- Items
- Item Warehouses
- Warehouses
- Sales Representatives
- Projects
- UOM
- UOM Conversion
- UOM Group
- Vendors
- Distribution Rules
- Accounts
- Tax Codes
- Users
- Banks
- Branches
- Serial Numbers
- Item Groups
- Item Group Accounts

Transaction Modules covered:
- Inventory Issue
- Inventory Return
- Inventory Transfer
- Purchase Request
- GL Issue
- GL Return
- Machine Issue
- Machine Return
- Labour Issue
- Labour Return
- Supplier Invoice
- Supplier Return
- Sub Contractor Mobilization
- Sub Contractor Retention
- Sub Contractor Invoice
- Sub Contractor Return
- Customer Mobilization
- Customer Invoice
- Customer Retention
- Customer Credit Note
- Project Posting

## 4. Migration Notes

- Your .NET code imported from SAP HANA and called SQL stored procedures.
- This Next.js version keeps SAP read and target posting as separate responsibilities.
- In this starter:
	- SAP read is done via Service Layer.
	- By default, posting is done to `TARGET_SYSTEM_BASE_URL + targetPath`.
	- If `MASTER_POST_TO_SAP_ENABLED=true`, selected master modules post directly to SAP Service Layer.
- You can now implement exact field mapping/transform for each master key in `src/lib/sync-master-data.ts` and `src/lib/master-data-map.ts`.

### 4.1 SAP Master POST endpoint alignment

When `MASTER_POST_TO_SAP_ENABLED=true`, these master keys post directly to SAP endpoints:

- Customer -> `POST /BusinessPartners`
- Vendor -> `POST /BusinessPartners`
- Item -> `POST /Items`
- Warehouse -> `POST /Warehouses`
- Price List -> `POST /PriceLists`
- UOM -> `POST /UnitOfMeasurements`
- UOM Group -> `POST /UnitOfMeasurementGroups`
- Sales Employee -> `POST /SalesPersons`
- Chart of Accounts -> `POST /ChartOfAccounts`
- Tax Codes -> `POST /VatGroups`
- Projects -> `POST /Projects`

For SAP destination mode, write behavior is:
- `POST` first
- On duplicate object error, auto fallback to `PATCH` by module key (upsert behavior)

Hardened modules in this flow:
- Periods
- Currency Rates
- Tax Codes
- UOM
- Warehouse

## 5. Production Recommendations

- Move SAP credentials to secret manager.
- Add request signing and allow-listing for sync routes.
- Add retry and dead-letter strategy for target posting.
- Add structured logs and job scheduler (cron/queue) for periodic sync.

## 6. Local SQL Server Integration

If you want sync transactions and error logs persisted to local SQL Server, enable these variables in `.env.local`:

- `LOCAL_DB_ENABLED=true`
- `LOCAL_DB_WRITE_MASTER_DATA=true`
- `LOCAL_DB_SERVER=<server>`
- `LOCAL_DB_NAME=<database>`
- `LOCAL_DB_USER=<username>`
- `LOCAL_DB_PASSWORD=<password>`
- `LOCAL_DB_ENCRYPT=false|true`
- `LOCAL_DB_TRUST_SERVER_CERTIFICATE=true|false`

When enabled:
- Tables are auto-created if missing: `dbo.SyncTransactions`, `dbo.SyncTransactionEvents`.
- Every sync transaction is upserted to `SyncTransactions`.
- Every sync event/error is inserted into `SyncTransactionEvents`.
- SAP master records are persisted to `dbo.SyncMasterDataRaw` when `LOCAL_DB_WRITE_MASTER_DATA=true` and `dryRun=false`.
- `currency` also refreshes `dbo.tblRefCurrency`, mirroring the old delete-and-insert flow.
- `customer` also updates `dbo.tblRefCustomer`, mirroring the old import/upsert/inactivate flow.
- `currency-rates` also refreshes `dbo.tblRefCurrencyRate`, mirroring the old delete-and-insert flow.
- `customer-currencies` also refreshes `dbo.tblRefCustomer_Currency`, mirroring the old clear-and-reload flow.
- `item-warehouses` also updates `dbo.tblRefItem_WH`, mirroring the old clear/upsert/inactivate flow.
- `periods` also updates `dbo.tblRefPeriods`, mirroring the old import/upsert/inactivate flow.
- `tax-codes` also updates `dbo.tblRefVATCodes`, mirroring the old import/upsert/inactivate flow.
- When the old customer stored procedures exist, the app prefers them: `dbo.tblRefCustomer_Insert` and `dbo.tblRefCustomer_UpdateInactive`.
- When the old item-warehouse stored procedures exist, the app prefers them: `dbo.tblRefItem_WH_Clear_UpdateInactive`, `dbo.tblRefItem_WH_Insert`, and `dbo.tblRefItem_WH_UpdateInactive`.
- When the old currency stored procedures exist, the app prefers them: `dbo.tblRefCurrency_Delete`, `dbo.tblRefCurrency_Insert`, `dbo.tblRefCurrencyRate_Delete`, `dbo.tblRefCurrencyRate_Insert`, `dbo.tblRefCustomer_Currency_Delete`, and `dbo.tblRefCustomer_Currency_Insert`.
- When the old periods stored procedures exist, the app prefers them: `dbo.tblRefPeriods_Insert` and `dbo.tblRefPeriods_UpdateInactive`.
- When the old VAT stored procedures exist, the app prefers them: `dbo.tblRefVATCodes_Clear_UpdateInactive`, `dbo.tblRefVATCodes_Insert`, and `dbo.tblRefVATCodes_UpdateInactive`.
- `uom` also updates `dbo.tblRefUnits` with the old upsert/inactivate flow when that legacy table already exists.
- `warehouse-master` also updates `dbo.tblWhseMst` with the old ImportStatus/Active flow when that legacy table already exists.

Customer legacy behavior:
- Source is SAP Service Layer `GET /b1s/v1/BusinessPartners?$filter=CardType eq 'C'`.
- Records are mapped from customer fields like `CardCode`, `CardName`, `Address`, `Country`, `Phone1`, `Fax`, `E_Mail` or `EmailAddress`, `VatRegNum`, `VatStatus`, `SlpCode`, `frozenFor` or `Frozen`, `CntctPrsn`, and `Currency` into `dbo.tblRefCustomer`.
- The local DB flow mirrors the provided old code: each customer is upserted and then inactive rows are updated, without a pre-clear step.
- Direct SQL fallback updates whichever legacy `tblRefCustomer` columns actually exist, keyed by `CustCode`.
- Rows not present in the current import are marked inactive through `Status=0` when that legacy column exists.
- Local DB writes prefer the old customer stored procedures when they exist and fall back to direct parameterized SQL when they do not.

Currency legacy behavior:
- `currency` reads currency master rows from SAP Service Layer and reloads `dbo.tblRefCurrency`.
- `currency-rates` reloads `dbo.tblRefCurrencyRate` from the fetched rate payload.
- `customer-currencies` reloads `dbo.tblRefCustomer_Currency` from customer `CardCode` and `Currency` values.
- SAP data is still fetched into the Next.js app as JSON.
- Local DB writes prefer the old stored procedures when they exist and fall back to direct parameterized SQL when they do not.

Item Warehouse legacy behavior:
- Source is SAP Service Layer `GET /b1s/v1/Items?$select=ItemCode,ItemWarehouseInfoCollection`.
- The app flattens each item's `ItemWarehouseInfoCollection` into legacy item-warehouse rows.
- Imported rows resolve `StockLink` from `dbo.tblRefItem` and `WhseLink` from `dbo.tblWhseMst`, then upsert into `dbo.tblRefItem_WH`.
- The clear step mirrors the old behavior by resetting `ImportStatus=0`, `QtyOnHand=0`, and `LastUnitCost=0` when those legacy columns exist.
- Imported rows are set active, and referenced non-imported rows are marked inactive through `Status=0`, matching the old `tblRefItem_WH_UpdateInactive` intent.
- Local DB writes prefer the old item-warehouse stored procedures when they exist and fall back to direct parameterized SQL when they do not.

Periods legacy behavior:
- Source is SAP Service Layer `GET /b1s/v1/Periods`.
- Records are mapped from `Code` or `PeriodCode`, `Name` or `PeriodName`, `F_RefDate` or `FromDate`, `T_RefDate` or `ToDate`, and `PeriodStat`-like fields into `dbo.tblRefPeriods`.
- Upserts refresh `T_RefDate`, `F_RefDate`, and `PeriodStat`, and also update `Code`, `Name`, and `ImportStatus` when those legacy columns exist.
- Rows not present in the current import are marked inactive through `PeriodStat=0`, matching the old `tblRefPeriods_UpdateInactive` intent.
- Local DB writes prefer the old periods stored procedures when they exist and fall back to direct parameterized SQL when they do not.

Tax legacy behavior:
- Source is SAP Service Layer `GET /b1s/v1/VatGroups?$filter=Account ne ''`, matching the old `OVTG WHERE Account <> ''` query.
- Records are mapped from `Code`, `Name`, `Rate`, `Locked`, and `Category` into `dbo.tblRefVATCodes`.
- Upserts refresh `Description`, `Persenatge`, `isActive`, `ImportStatus`, `Type`, `VATPcntage`, and `IsNBT` when those legacy columns exist.
- Rows not present in the current import are marked inactive through `isActive=0`, matching the old `tblRefVATCodes_UpdateInactive` intent.
- Local DB writes prefer the old VAT stored procedures when they exist and fall back to direct parameterized SQL when they do not.

UOM legacy behavior:
- Source is SAP Service Layer `GET /b1s/v1/UnitOfMeasurements`.
- Records are upserted by `idUnits` mapped from `UomEntry` into `dbo.tblRefUnits`.
- Updated rows refresh `cUnitCode`, `cUnitDescription`, `iUnitCategoryID`, and `bUnitRoundUp`.
- Rows not present in the current import are marked inactive through `Status=0`, matching the old `tblRefUnits_UpdateInactive` behavior.

Warehouse legacy behavior:
- Source is SAP Service Layer `GET /b1s/v1/Warehouses`.
- Records are upserted by `WhseCode` into `dbo.tblWhseMst`.
- Existing rows are first marked `ImportStatus=0`, refreshed rows are set back to `ImportStatus=1`.
- Warehouses still referenced by legacy transaction detail tables are kept but marked inactive.
- Unreferenced inactive rows left behind by the import are deleted, matching the old stored procedure behavior.

## 6.1 Payload Validation Safety

Master records are validated before save/post.

Environment flags:
- `MASTER_VALIDATION_ENABLED=true`
- `MASTER_VALIDATION_STRICT=true`
- `MASTER_VALIDATION_MAX_ERRORS=25`

Behavior:
- Strict mode (`MASTER_VALIDATION_STRICT=true`): sync fails when invalid records are found.
- Lenient mode (`MASTER_VALIDATION_STRICT=false`): invalid records are skipped and valid records continue.
- Sync response includes `validCount`, `invalidCount`, and `validationErrors` sample entries.

## 7. Run Automatically As A Service (Windows)

To run this continuously and sync automatically:

1. Run the API app as one service process.
2. Run Master worker as a second service process.
3. Run Transaction worker as a third service process.

This gives you separate runtime control, restart policy, and logs for master sync and transaction posting.

Physical split projects created:
- `services/master-service` (standalone package)
- `services/transaction-service` (standalone package)

### 7.0 Separate runtime commands

From project root:

```bash
npm run start
```

```bash
npm run service:master:install
npm run service:master:start
```

```bash
npm run service:transaction:install
npm run service:transaction:start
```

Master standalone service continuously calls `/api/master/jobs/legacy-core`.

Transaction standalone service continuously calls `/api/transactions/jobs/legacy-full`.

Important:
- If `LOCAL_DB_ENABLED=false`, set `TRANSACTION_JOB_USE_PENDING_FROM_LOCAL_DB=false`.
- If `LOCAL_DB_ENABLED=true`, keep `TRANSACTION_JOB_USE_PENDING_FROM_LOCAL_DB=true` to read pending rows from your SQL procedures.
- For 1000+ row posting stability, tune retry/concurrency env values below.

Intervals and behavior are controlled by environment variables in `.env.local`:
- `INTEGRATION_BASE_URL`
- `MASTER_JOB_INTERVAL_SECONDS`
- `MASTER_JOB_DRY_RUN`
- `MASTER_JOB_CONTINUE_ON_ERROR`
- `TRANSACTION_JOB_INTERVAL_SECONDS`
- `TRANSACTION_JOB_DRY_RUN`
- `TRANSACTION_JOB_CONTINUE_ON_ERROR`
- `TRANSACTION_JOB_USE_PENDING_FROM_LOCAL_DB`
- `TRANSACTION_JOB_MAX_RECORDS`
- `TRANSACTION_POST_CONCURRENCY`
- `TRANSACTION_POST_MAX_RETRIES`
- `TRANSACTION_POST_RETRY_DELAY_MS`
- `RUN_ONCE`

### 7.0.1 SP usage and high-volume guidance

Using stored procedures as the source is recommended for large posting volumes.

Recommended baseline for 1000+ rows:
- `TRANSACTION_JOB_MAX_RECORDS=1000`
- `TRANSACTION_POST_CONCURRENCY=3`
- `TRANSACTION_POST_MAX_RETRIES=2`
- `TRANSACTION_POST_RETRY_DELAY_MS=600`

If SAP is slow or returning throttling/timeout errors:
- Lower `TRANSACTION_POST_CONCURRENCY` to `1` or `2`
- Increase `TRANSACTION_POST_RETRY_DELAY_MS` to `1000`-`2000`

If you share your SP definitions and output columns, mapping can be tuned exactly per module for best performance and fewer rejects.

### 7.1 Run app as Windows service

Recommended with NSSM:

1. Install NSSM.
2. Create a service:

```powershell
nssm install SAPIntegrationNextJS "C:\\Program Files\\nodejs\\npm.cmd" "run start"
```

3. Set service startup directory to your project folder:
- `C:\SAP Transaction\sap-integration-nextjs`

4. Start service:

```powershell
nssm start SAPIntegrationNextJS
```

### 7.2 Run Master worker as Windows service

Install:

```powershell
nssm install SAPIntegrationMasterWorker "C:\\Program Files\\nodejs\\npm.cmd" "start"
```

Startup directory:
- `C:\SAP Transaction\sap-integration-nextjs\services\master-service`

Start service:

```powershell
nssm start SAPIntegrationMasterWorker
```

### 7.3 Run Transaction worker as Windows service

Install:

```powershell
nssm install SAPIntegrationTransactionWorker "C:\\Program Files\\nodejs\\npm.cmd" "start"
```

Startup directory:
- `C:\SAP Transaction\sap-integration-nextjs\services\transaction-service`

Start service:

```powershell
nssm start SAPIntegrationTransactionWorker
```

### 7.4 Service order recommendation

Start order:
1. `SAPIntegrationNextJS`
2. `SAPIntegrationMasterWorker`
3. `SAPIntegrationTransactionWorker`

Set worker services to delayed start or dependency on API service, so workers do not fail at boot before API becomes available.

### 7.2 Schedule master sync job

Use provided script:
- `scripts/run-legacy-core-job.ps1`

Manual test:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-legacy-core-job.ps1 -BaseUrl "http://localhost:3000" -DryRun:$false
```

Schedule every 30 minutes (Task Scheduler command):

```powershell
schtasks /Create /SC MINUTE /MO 30 /TN "SAP Legacy Core Sync" /TR "powershell -ExecutionPolicy Bypass -File \"C:\SAP Transaction\sap-integration-nextjs\scripts\run-legacy-core-job.ps1\" -BaseUrl \"http://localhost:3000\" -DryRun:$false" /F
```

Logs are written to:
- `logs/automation/*.json`
