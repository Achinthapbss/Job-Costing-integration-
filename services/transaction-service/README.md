# Transaction Service

Standalone worker service for running the legacy transaction posting job on an interval.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy env file and set values:

```bash
cp .env.example .env
```

3. Run service:

```bash
npm start
```

4. Run once only (for smoke tests):

```bash
npm run start:once
```

## Endpoint it calls

- POST /api/transactions/jobs/legacy-full

The API app must be running and reachable via INTEGRATION_BASE_URL.
If LOCAL_DB_ENABLED=false in API app, set TRANSACTION_JOB_USE_PENDING_FROM_LOCAL_DB=false.
Leave TRANSACTION_JOB_MAX_RECORDS empty to process all available rows.
