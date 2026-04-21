export type SyncLogLevel = "info" | "warn" | "error";

export type SyncTransactionStatus = "in-progress" | "success" | "failed";

export interface SyncTransactionEvent {
  id: string;
  transactionId: string;
  timestamp: string;
  level: SyncLogLevel;
  stage: string;
  message: string;
  details?: unknown;
}

export interface SyncTransactionRecord {
  transactionId: string;
  key: string;
  dryRun: boolean;
  query?: string;
  targetOverridePath?: string;
  status: SyncTransactionStatus;
  startedAt: string;
  endedAt?: string;
  sourcePath?: string;
  targetPath?: string;
  sourceCount?: number;
  postedCount?: number;
  skippedCount?: number;
  error?: string;
  events: SyncTransactionEvent[];
}
