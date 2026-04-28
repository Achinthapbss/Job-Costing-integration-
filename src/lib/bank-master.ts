import { MasterDataKey } from "@/types/master-data";

type Row = Record<string, unknown>;

export interface BankLegacyRow {
  bankCode: string;
  branchCode: string;
  branchName: string;
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

function limitString(value: string | null, maxLength: number): string {
  if (!value) {
    return "";
  }

  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function parseLockedToActive(value: unknown): boolean {
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

export function isBankKey(key: MasterDataKey): key is "bank" | "banks" {
  return key === "bank" || key === "banks";
}

export function mapBankLegacyRow(raw: unknown): BankLegacyRow | null {
  const row = asRow(raw);

  const bankCode = limitString(pickString(row, ["BankCode", "Code"]), 50);
  if (!bankCode) {
    return null;
  }

  const branchCode =
    limitString(pickString(row, ["BranchCode", "Code", "AbsEntry"]), 50) || bankCode;

  return {
    bankCode,
    branchCode,
    branchName:
      limitString(pickString(row, ["BranchName", "BankName", "Name"]), 500) || branchCode,
    active: parseLockedToActive(row.Locked),
  };
}
