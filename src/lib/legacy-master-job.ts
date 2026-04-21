import { SyncExecutionError, syncMasterData } from "@/lib/sync-master-data";
import { MasterDataKey, SyncMasterDataResult } from "@/types/master-data";

export interface LegacyJobStepResult {
  key: MasterDataKey;
  ok: boolean;
  transactionId?: string;
  result?: SyncMasterDataResult;
  error?: string;
}

export interface LegacyJobResult {
  ok: boolean;
  dryRun: boolean;
  startedAt: string;
  endedAt: string;
  steps: LegacyJobStepResult[];
}

// Mirrors old WinForms Form1 button35 flow with inventory sub-steps.
export const legacyCoreSequence: MasterDataKey[] = [
  "item",
  "item-group",
  "item-group-accounts",
  "warehouse-master",
  "item-warehouses",
  "uom-group",
];

// Mirrors old WinForms Form1 button2 flow.
export const legacyCurrencySequence: MasterDataKey[] = [
  "currency",
  "currency-rates",
  "customer-currencies",
];

export const legacyFullMasterSequence: MasterDataKey[] = [
  ...legacyCoreSequence,
  ...legacyCurrencySequence,
];

async function runLegacyMasterJobSequence(
  sequence: MasterDataKey[],
  input: {
    dryRun: boolean;
    continueOnError: boolean;
  }
): Promise<LegacyJobResult> {
  const startedAt = new Date().toISOString();
  const steps: LegacyJobStepResult[] = [];

  for (const key of sequence) {
    try {
      const result = await syncMasterData({ key, dryRun: input.dryRun });
      steps.push({
        key,
        ok: true,
        transactionId: result.transactionId,
        result,
      });
    } catch (error) {
      const txId = error instanceof SyncExecutionError ? error.transactionId : undefined;
      const message = error instanceof Error ? error.message : "Unknown legacy job error";

      steps.push({
        key,
        ok: false,
        transactionId: txId,
        error: message,
      });

      if (!input.continueOnError) {
        break;
      }
    }
  }

  const ok = steps.every((step) => step.ok);

  return {
    ok,
    dryRun: input.dryRun,
    startedAt,
    endedAt: new Date().toISOString(),
    steps,
  };
}

export async function runLegacyCoreMasterJob(input: {
  dryRun: boolean;
  continueOnError: boolean;
}): Promise<LegacyJobResult> {
  return runLegacyMasterJobSequence(legacyCoreSequence, input);
}

export async function runLegacyCurrencyMasterJob(input: {
  dryRun: boolean;
  continueOnError: boolean;
}): Promise<LegacyJobResult> {
  return runLegacyMasterJobSequence(legacyCurrencySequence, input);
}

export async function runLegacyFullMasterJob(input: {
  dryRun: boolean;
  continueOnError: boolean;
}): Promise<LegacyJobResult> {
  return runLegacyMasterJobSequence(legacyFullMasterSequence, input);
}
