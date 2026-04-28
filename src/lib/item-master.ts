import { MasterDataKey } from "@/types/master-data";

type Row = Record<string, unknown>;

export interface ItemLegacyRow {
  itemCode: string;
  itemClass: string;
  itemDesc: string;
  isChargable: boolean;
  idUnits: number;
  date: Date;
  status: boolean;
  qtyOnHand: number;
  qtyOnOrder: number;
  qtyOnAvailable: number;
  lastUnitCost: number;
  modelNo: string;
  groupCode: string;
  isServiceItem: boolean;
  packCode: string;
  isSerial: boolean;
  udf3: string;
  udf5: string;
  rate: number;
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

function pickNumber(row: Row, keys: string[]): number | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        continue;
      }

      const parsed = Number(trimmed);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function pickDate(row: Row, keys: string[]): Date | null {
  for (const key of keys) {
    const value = row[key];
    if (value instanceof Date && Number.isFinite(value.getTime())) {
      return value;
    }

    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = new Date(value);
      if (Number.isFinite(parsed.getTime())) {
        return parsed;
      }
    }
  }

  return null;
}

function parseBoolean(value: unknown, defaultValue: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value !== 0;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toUpperCase();
    if (["Y", "YES", "TRUE", "1", "TYES"].includes(normalized)) {
      return true;
    }
    if (["N", "NO", "FALSE", "0", "TNO"].includes(normalized)) {
      return false;
    }
  }

  return defaultValue;
}

function limitString(value: string | null, maxLength: number): string {
  if (!value) {
    return "";
  }

  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

export function isItemKey(key: MasterDataKey): key is "item" {
  return key === "item";
}

export function mapItemLegacyRow(raw: unknown): ItemLegacyRow | null {
  const row = asRow(raw);

  const itemCode = limitString(pickString(row, ["ItemCode", "Code"]), 400);
  if (!itemCode) {
    return null;
  }

  const itemClassRaw = pickString(row, ["ItemClass", "ItemType"]);

  return {
    itemCode,
    // Mirrors old C# behavior exactly.
    itemClass: itemClassRaw === "I" ? "Service" : "Material",
    itemDesc: limitString(pickString(row, ["ItemName", "ItemDesc", "Name"]), 500) || itemCode,
    isChargable: true,
    idUnits: pickNumber(row, ["IUoMEntry", "InventoryUOM", "UoMGroupEntry", "UgpEntry"]) ?? 0,
    date: pickDate(row, ["CreateDate", "CreateDateTime", "UpdateDate"]) ?? new Date(),
    status: parseBoolean(row.validFor, true),
    qtyOnHand: pickNumber(row, ["OnHand"]) ?? 0,
    qtyOnOrder: pickNumber(row, ["OnOrder"]) ?? 0,
    qtyOnAvailable: pickNumber(row, ["OnHand"]) ?? 0,
    lastUnitCost: pickNumber(row, ["AvgPrice", "LastPurPrc", "LastUnitCost"]) ?? 0,
    modelNo: limitString(pickString(row, ["ITEMTYPE", "ModelNo", "Model"]), 500),
    groupCode: limitString(pickString(row, ["ItmsGrpNam", "ItemsGroupCode", "GroupCode"]), 500),
    isServiceItem: parseBoolean(row.InvntItem, true) ? false : true,
    packCode: "",
    isSerial: parseBoolean(row.ManSerNum, false),
    udf3: limitString(pickString(row, ["UgpEntry", "UDF3"]), 100),
    udf5: limitString(pickString(row, ["UDF5"]), 100),
    rate: pickNumber(row, ["Rate"]) ?? 0,
  };
}
