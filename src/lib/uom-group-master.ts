import { MasterDataKey } from "@/types/master-data";

type Row = Record<string, unknown>;

export interface UomGroupLegacyRow {
  ugpEntry: number;
  ugpCode: string;
  ugpName: string;
  baseUom: number;
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

export function isUomGroupKey(key: MasterDataKey): key is "uom-group" {
  return key === "uom-group";
}

export function mapUomGroupLegacyRow(raw: unknown): UomGroupLegacyRow | null {
  const row = asRow(raw);

  const ugpEntry = pickNumber(row, ["UgpEntry", "AbsEntry", "Code"]);
  if (ugpEntry === null) {
    return null;
  }

  const ugpCode =
    limitString(pickString(row, ["UgpCode", "Code", "UoMGroupCode"]), 50) || String(ugpEntry);

  return {
    ugpEntry,
    ugpCode,
    ugpName: limitString(pickString(row, ["UgpName", "Name", "UoMGroupName"]), 50) || ugpCode,
    baseUom: pickNumber(row, ["BaseUom", "BaseUoM", "BaseUomEntry"]) ?? 0,
  };
}
