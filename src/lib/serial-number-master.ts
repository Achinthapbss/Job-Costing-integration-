import { MasterDataKey } from "@/types/master-data";

type Row = Record<string, unknown>;

export interface SerialNumberLegacyRow {
  itemCode: string;
  whCode: string;
  quantity: number;
  sn: string;
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

function limitString(value: string | null, maxLength: number): string {
  if (!value) {
    return "";
  }

  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

export function isSerialNumbersKey(key: MasterDataKey): key is "serial-numbers" {
  return key === "serial-numbers";
}

export function mapSerialNumberLegacyRow(raw: unknown): SerialNumberLegacyRow | null {
  const row = asRow(raw);

  const itemCode = limitString(pickString(row, ["ItemCode"]), 100);
  const whCode = limitString(pickString(row, ["WhsCode", "WHCode", "WarehouseCode"]), 100);
  const sn = limitString(pickString(row, ["MnfSerial", "SN", "SerialNumber"]), 500);

  if (!itemCode || !whCode || !sn) {
    return null;
  }

  return {
    itemCode,
    whCode,
    quantity: pickNumber(row, ["Quantity"]) ?? 0,
    sn,
  };
}
