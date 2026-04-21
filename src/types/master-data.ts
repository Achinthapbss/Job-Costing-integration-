export type MasterDataKey =
  | "price-list"
  | "periods"
  | "currency"
  | "currencies"
  | "customer"
  | "customer-currencies"
  | "currency-rates"
  | "item"
  | "item-warehouses"
  | "warehouse-master"
  | "warehouses"
  | "sales-rep"
  | "project"
  | "uom"
  | "uom-conversion"
  | "uom-group"
  | "vendor"
  | "distribution-rules"
  | "accounts"
  | "tax-codes"
  | "login-users"
  | "users"
  | "bank"
  | "banks"
  | "branch"
  | "branches"
  | "serial-numbers"
  | "item-group"
  | "item-groups"
  | "item-group-accounts";

export type SyncTargetMode = "none" | "per-record" | "bulk";

export interface MasterDataEndpointConfig {
  key: MasterDataKey;
  label: string;
  sourcePath: string;
  targetPath: string;
  sapPostPath?: string;
  sapUpsertKeyField?: string;
  syncTargetMode: SyncTargetMode;
  notes?: string;
}

export interface SyncMasterDataOptions {
  key: MasterDataKey;
  query?: string;
  dryRun?: boolean;
  targetOverridePath?: string;
}

export interface SyncMasterDataResult {
  transactionId: string;
  key: MasterDataKey;
  sourcePath: string;
  sourceCount: number;
  validCount?: number;
  invalidCount?: number;
  validationErrors?: Array<{
    index: number;
    missingFields: string[];
  }>;
  postedCount: number;
  skippedCount: number;
  dryRun: boolean;
  targetPath: string;
}
