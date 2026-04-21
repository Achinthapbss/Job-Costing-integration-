import { MasterDataKey } from "@/types/master-data";

type Row = Record<string, unknown>;

export interface UomLegacyRow {
  idUnits: number;
  unitCode: string;
  unitDescription: string;
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

function pickInteger(row: Row, keys: string[]): number | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isInteger(value)) {
      return value;
    }

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        continue;
      }

      const parsed = Number(trimmed);
      if (Number.isInteger(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function limitString(value: string | null, maxLength: number): string | null {
  if (!value) {
    return null;
  }

  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

export function isUomMasterKey(key: MasterDataKey): key is "uom" {
  return key === "uom";
}

export function mapUomLegacyRow(raw: unknown): UomLegacyRow | null {
  const row = asRow(raw);
  const idUnits = pickInteger(row, ["UomEntry", "UoMEntry", "AbsEntry"]);
  const unitCode = limitString(pickString(row, ["UomCode", "UoMCode", "Code"]), 100);

  if (idUnits === null || !unitCode) {
    return null;
  }

  const unitDescription =
    limitString(pickString(row, ["UomName", "UoMName", "Name", "Description"]), 100) ?? unitCode;

  return {
    idUnits,
    unitCode,
    unitDescription,
  };
}