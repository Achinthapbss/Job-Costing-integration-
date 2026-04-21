export type TransactionKey =
  | "project-export"
  | "project-posting"
  | "inventory-issue"
  | "inventory-return"
  | "gl-issue"
  | "gl-return"
  | "labour-issue"
  | "labour-return"
  | "supplier-invoice"
  | "supplier-issue"
  | "supplier-return"
  | "subcon-mobilization"
  | "subcon-retention"
  | "subcon-invoice"
  | "subcon-return"
  | "customer-mobilization"
  | "customer-invoice"
  | "customer-retention"
  | "customer-credit-note"
  | "customer-return"
  | "machine-issue"
  | "machine-return"
  | "inventory-transfer"
  | "purchase-request"
  | "inventory-po-request";

export interface TransactionEndpointConfig {
  key: TransactionKey;
  label: string;
  sapServiceLayerPath: string;
  pendingHeaderSp?: string;
  pendingDetailSp?: string;
  detailParamName?: string;
  detailParamField?: string;
  notes?: string;
}

export interface TransactionRunOptions {
  key: TransactionKey;
  dryRun?: boolean;
  continueOnError?: boolean;
  usePendingFromLocalDb?: boolean;
  maxRecords?: number;
  payloads?: unknown[];
}

export interface TransactionRunResult {
  transactionId: string;
  key: TransactionKey;
  dryRun: boolean;
  sourceCount: number;
  postedCount: number;
  failedCount: number;
  skippedCount: number;
  source: "request" | "local-db";
  errors: Array<{ index: number; message: string }>;
}
