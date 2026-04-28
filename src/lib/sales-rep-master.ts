import { MasterDataKey } from "@/types/master-data";

type Row = Record<string, unknown>;

export interface SalesRepLegacyRow {
  repId: string;
  lastName: string;
  userId: number;
  status: boolean;
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

function deriveSalesRepStatus(row: Row): boolean {
  const active = pickString(row, ["Active", "active", "Status"]);

  if (active) {
    const normalized = active.trim().toUpperCase();

    if (["Y", "YES", "TRUE", "1", "TYES"].includes(normalized)) {
      return true;
    }

    if (["N", "NO", "FALSE", "0", "TNO"].includes(normalized)) {
      return false;
    }
  }

  return true;
}

export function isSalesRepKey(key: MasterDataKey): key is "sales-rep" {
  return key === "sales-rep";
}

export function mapSalesRepLegacyRow(raw: unknown): SalesRepLegacyRow | null {
  const row = asRow(raw);

  const repId = limitString(
    pickString(row, ["SlpCode", "SalesEmployeeCode", "RepID", "Code"]),
    100
  );
  if (!repId) {
    return null;
  }

  return {
    repId,
    lastName: limitString(
      pickString(row, ["SlpName", "SalesEmployeeName", "LastName", "Name"]),
      4000
    ) || repId,
    userId: pickNumber(row, ["EmpID", "UserID", "EmployeeID"]) ?? 0,
    status: deriveSalesRepStatus(row),
  };
}
