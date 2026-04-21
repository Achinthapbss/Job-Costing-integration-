# Master Service

Standalone worker service for running the legacy master sync job on an interval.

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

- POST /api/master/jobs/legacy-core

The API app must be running and reachable via INTEGRATION_BASE_URL.
