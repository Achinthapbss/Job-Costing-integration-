const baseUrl = process.env.INTEGRATION_BASE_URL ?? "http://localhost:3000";
const intervalSeconds = Number(process.env.MASTER_JOB_INTERVAL_SECONDS ?? "300");
const dryRun = (process.env.MASTER_JOB_DRY_RUN ?? "false").toLowerCase() === "true";
const continueOnError = (process.env.MASTER_JOB_CONTINUE_ON_ERROR ?? "true").toLowerCase() === "true";
const runOnce = (process.env.RUN_ONCE ?? "false").toLowerCase() === "true";

if (!Number.isFinite(intervalSeconds) || intervalSeconds < 5) {
  console.error("MASTER_JOB_INTERVAL_SECONDS must be a number >= 5");
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function runMasterJob() {
  const startedAt = new Date().toISOString();
  const url = `${baseUrl.replace(/\/$/, "")}/api/master/jobs/legacy-core`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dryRun,
        continueOnError,
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
      job: "master",
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
      job: "master",
      error: error instanceof Error ? error.message : "Unknown error",
    };
    console.error(JSON.stringify(summary));
    return false;
  }
}

async function main() {
  console.log(
    JSON.stringify({
      worker: "master",
      baseUrl,
      intervalSeconds,
      dryRun,
      continueOnError,
      runOnce,
    })
  );

  do {
    await runMasterJob();
    if (!runOnce) {
      await sleep(intervalSeconds * 1000);
    }
  } while (!runOnce);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Worker crashed");
  process.exit(1);
});
