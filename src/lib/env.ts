function requireValue(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getSapEnv() {
  return {
    sapServiceLayerBaseUrl: requireValue(
      "SAP_SERVICE_LAYER_BASE_URL",
      process.env.SAP_SERVICE_LAYER_BASE_URL
    ),
    sapCompanyDb: requireValue("SAP_COMPANY_DB", process.env.SAP_COMPANY_DB),
    sapUsername: requireValue("SAP_USERNAME", process.env.SAP_USERNAME),
    sapPassword: requireValue("SAP_PASSWORD", process.env.SAP_PASSWORD),
    defaultPageSize: Number(process.env.SAP_DEFAULT_PAGE_SIZE ?? "200"),
  };
}

export function getTargetEnv() {
  return {
    targetSystemBaseUrl: process.env.TARGET_SYSTEM_BASE_URL ?? "",
    targetSystemApiKey: process.env.TARGET_SYSTEM_API_KEY ?? "",
  };
}

function toBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

export function getValidationEnv() {
  return {
    enabled: toBoolean(process.env.MASTER_VALIDATION_ENABLED, true),
    strict: toBoolean(process.env.MASTER_VALIDATION_STRICT, true),
    maxErrors: Number(process.env.MASTER_VALIDATION_MAX_ERRORS ?? "25"),
  };
}

export function getMasterPostEnv() {
  return {
    postToSapEnabled: toBoolean(process.env.MASTER_POST_TO_SAP_ENABLED, false),
  };
}

export function getTransactionPostEnv() {
  const concurrency = Number(process.env.TRANSACTION_POST_CONCURRENCY ?? "3");
  const maxRetries = Number(process.env.TRANSACTION_POST_MAX_RETRIES ?? "2");
  const retryDelayMs = Number(process.env.TRANSACTION_POST_RETRY_DELAY_MS ?? "600");

  return {
    concurrency: Number.isFinite(concurrency) && concurrency > 0 ? Math.min(10, concurrency) : 3,
    maxRetries: Number.isFinite(maxRetries) && maxRetries >= 0 ? Math.min(10, maxRetries) : 2,
    retryDelayMs: Number.isFinite(retryDelayMs) && retryDelayMs >= 100 ? retryDelayMs : 600,
  };
}
