const baseUrl = process.env.INTEGRATION_BASE_URL ?? "http://localhost:3000";
const intervalSeconds = Number(process.env.TRANSACTION_JOB_INTERVAL_SECONDS ?? "120");
const dryRun = (process.env.TRANSACTION_JOB_DRY_RUN ?? "false").toLowerCase() === "true";
const continueOnError =
  (process.env.TRANSACTION_JOB_CONTINUE_ON_ERROR ?? "true").toLowerCase() === "true";
const usePendingFromLocalDb =
  (process.env.TRANSACTION_JOB_USE_PENDING_FROM_LOCAL_DB ?? "true").toLowerCase() === "true";
const maxRecordsRaw = process.env.TRANSACTION_JOB_MAX_RECORDS?.trim() ?? "";
const maxRecords = maxRecordsRaw ? Number(maxRecordsRaw) : undefined;
const runOnce = (process.env.RUN_ONCE ?? "false").toLowerCase() === "true";

if (!Number.isFinite(intervalSeconds) || intervalSeconds < 5) {
  console.error("TRANSACTION_JOB_INTERVAL_SECONDS must be a number >= 5");
  process.exit(1);
}

if (maxRecordsRaw && (!Number.isFinite(maxRecords) || maxRecords < 1)) {
  console.error("TRANSACTION_JOB_MAX_RECORDS must be a number >= 1");
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function runTransactionJob() {
  const startedAt = new Date().toISOString();
  const url = `${baseUrl.replace(/\/$/, "")}/api/transactions/jobs/legacy-full`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dryRun,
        continueOnError,
        usePendingFromLocalDb,
        ...(maxRecords ? { maxRecords } : {}),
      }),
    });

    const text = await response.text();
    let body = {};

    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }

    const ok = response.ok && body && body.ok === true;
    const summary = {
      startedAt,
      endedAt: new Date().toISOString(),
      ok,
      status: response.status,
      url,
      job: "transaction",
      result: body,
    };

    console.log(JSON.stringify(summary));
    return ok;
  } catch (error) {
    const summary = {
      startedAt,
      endedAt: new Date().toISOString(),
      ok: false,
      url,
      job: "transaction",
      error: error instanceof Error ? error.message : "Unknown error",
    };
    console.error(JSON.stringify(summary));
    return false;
  }
}

async function main() {
  console.log(
    JSON.stringify({
      worker: "transaction",
      baseUrl,
      intervalSeconds,
      dryRun,
      continueOnError,
      usePendingFromLocalDb,
      maxRecords: maxRecords ?? "unlimited",
      runOnce,
    })
  );

  do {
    await runTransactionJob();
    if (!runOnce) {
      await sleep(intervalSeconds * 1000);
    }
  } while (!runOnce);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Worker crashed");
  process.exit(1);
});
