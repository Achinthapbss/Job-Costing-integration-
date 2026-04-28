import { MasterDataKey } from "@/types/master-data";

type Row = Record<string, unknown>;

export interface AccountLegacyRow {
  account: string;
  masterSubAccount: string;
  accountType: string;
  accountLink: string;
  description: string;
  taxLink: number;
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

function limitString(value: string | null, maxLength: number): string | null {
  if (!value) {
    return null;
  }

  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function parseBooleanLike(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value !== 0;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toUpperCase();

    if (["1", "TRUE", "YES", "Y", "TYES", "ACTIVE"].includes(normalized)) {
      return true;
    }

    if (["0", "FALSE", "NO", "N", "TNO", "INACTIVE"].includes(normalized)) {
      return false;
    }
  }

  return null;
}

function deriveAccountStatus(row: Row): boolean {
  const frozen = pickString(row, ["Frozen", "FrozenFor", "frozenFor"]);
  if (frozen) {
    const normalized = frozen.trim().toUpperCase();
    if (["N", "TNO", "FALSE", "0", "NO"].includes(normalized)) {
      return true;
    }
    if (["Y", "TYES", "TRUE", "1", "YES"].includes(normalized)) {
      return false;
    }
  }

  const active =
    parseBooleanLike(row.ActiveAccount) ??
    parseBooleanLike(row.Active) ??
    parseBooleanLike(row.Status);

  if (active !== null) {
    return active;
  }

  const inactive = parseBooleanLike(row.Inactive);
  if (inactive !== null) {
    return !inactive;
  }

  return true;
}

function deriveAccountCode(row: Row): string | null {
  return (
    limitString(pickString(row, ["Segment_0", "Account", "FormatCode"]), 50) ??
    limitString(pickString(row, ["ActId", "AcctCode", "Code"]), 50)
  );
}

export function isAccountsKey(key: MasterDataKey): key is "accounts" {
  return key === "accounts";
}

export function mapAccountLegacyRow(raw: unknown): AccountLegacyRow | null {
  const row = asRow(raw);

  const accountLink =
    limitString(pickString(row, ["AcctCode", "Code", "ActId", "FormatCode"]), 500) ?? "";
  if (!accountLink) {
    return null;
  }

  const account = deriveAccountCode(row) ?? accountLink.slice(0, 50);
  const description =
    limitString(pickString(row, ["AcctName", "Name", "Description"]), 500) ?? accountLink;

  return {
    account,
    masterSubAccount: account,
    accountType:
      limitString(pickString(row, ["Groups", "GroupMask", "AccountType", "Category"]), 50) ?? "",
    accountLink,
    description,
    taxLink: Math.trunc(pickNumber(row, ["DfltTax", "TaxLink", "DefaultTax", "VatGroup"]) ?? 0),
    status: deriveAccountStatus(row),
  };
}