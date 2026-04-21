import { MasterDataKey } from "@/types/master-data";

type Row = Record<string, unknown>;

export interface WarehouseMasterLegacyRow {
  warehouseCode: string;
  warehouseName: string;
  warehouseBranchCode: string | null;
  warehouseBankAccNum: string | null;
  active: boolean;
}

function asRow(value: unknown): Row {
  return (value ?? {}) as Row;
}

function pickString(row: Row, keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return null;
}

function parseBooleanLike(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value !== 0;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "y", "tyes", "active"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "n", "tno", "inactive"].includes(normalized)) {
    return false;
  }

  return null;
}

function limitString(value: string | null, maxLength: number): string | null {
  if (!value) {
    return null;
  }

  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function deriveActive(row: Row): boolean {
  const active = parseBooleanLike(row.Active);
  if (active !== null) {
    return active;
  }

  const inactive = parseBooleanLike(row.Inactive);
  if (inactive !== null) {
    return !inactive;
  }

  return true;
}

export function isWarehouseMasterKey(key: MasterDataKey): key is "warehouse-master" | "warehouses" {
  return key === "warehouse-master" || key === "warehouses";
}

export function mapWarehouseMasterLegacyRow(raw: unknown): WarehouseMasterLegacyRow | null {
  const row = asRow(raw);
  const warehouseCode = limitString(pickString(row, ["WarehouseCode", "WhsCode", "Code"]), 20);

  if (!warehouseCode) {
    return null;
  }

  const warehouseName =
    limitString(pickString(row, ["WarehouseName", "WhsName", "Name"]), 50) ?? warehouseCode;

  return {
    warehouseCode,
    warehouseName,
    warehouseBranchCode: limitString(
      pickString(row, [
        "WhseBranchCode",
        "Grp_Code",
        "BranchCode",
        "BusinessPlaceID",
        "BPLID",
        "BPLId",
        "BPL_ID",
      ]),
      30
    ),
    warehouseBankAccNum: limitString(
      pickString(row, [
        "WhseBankAccNum",
        "BalInvntAc",
        "BalanceInventoryAccount",
        "PurchaseBalanceAccount",
        "InventoryAccount",
      ]),
      30
    ),
    active: deriveActive(row),
  };
}