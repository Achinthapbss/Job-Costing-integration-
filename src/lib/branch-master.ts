import { MasterDataKey } from "@/types/master-data";

type Row = Record<string, unknown>;

export interface BranchLegacyRow {
  branchCode: string;
  branchDes: string;
  status: boolean;
  enterUser: string;
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

function limitString(value: string | null, maxLength: number): string {
  if (!value) {
    return "";
  }

  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function parseLockedToStatus(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toUpperCase();
    if (["N", "NO", "FALSE", "0", "TNO"].includes(normalized)) {
      return true;
    }
    if (["Y", "YES", "TRUE", "1", "TYES"].includes(normalized)) {
      return false;
    }
  }

  return true;
}

export function isBranchKey(key: MasterDataKey): key is "branch" | "branches" {
  return key === "branch" || key === "branches";
}

export function mapBranchLegacyRow(raw: unknown): BranchLegacyRow | null {
  const row = asRow(raw);

  const branchCode = limitString(pickString(row, ["BranchCode", "Code"]), 50);
  if (!branchCode) {
    return null;
  }

  return {
    branchCode,
    branchDes: limitString(pickString(row, ["BranchName", "Name", "BranchDes"]), 100) || branchCode,
    status: parseLockedToStatus(row.Locked),
    enterUser: "SYSTEM",
  };
}
