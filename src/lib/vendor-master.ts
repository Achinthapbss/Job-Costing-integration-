import { MasterDataKey } from "@/types/master-data";

type Row = Record<string, unknown>;

export interface VendorLegacyRow {
  vendorCode: string;
  vendorName: string;
  status: boolean;
  taxLink: number;
  address: string;
  fax: string;
  email: string;
  tpNo: string;
  currencyCode: string;
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

function parseBooleanLike(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value !== 0;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toUpperCase();

    if (["1", "TRUE", "YES", "Y", "TYES"].includes(normalized)) {
      return true;
    }

    if (["0", "FALSE", "NO", "N", "TNO"].includes(normalized)) {
      return false;
    }
  }

  return null;
}

function deriveVendorStatus(row: Row): boolean {
  // frozenFor == "N" means active (not frozen), "Y" means inactive
  const frozen = pickString(row, ["frozenFor", "FrozenFor", "Frozen"]);

  if (frozen) {
    const normalized = frozen.trim().toUpperCase();

    if (["N", "TNO", "FALSE", "0", "NO"].includes(normalized)) {
      return true;
    }

    if (["Y", "TYES", "TRUE", "1", "YES"].includes(normalized)) {
      return false;
    }
  }

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

export function isVendorKey(key: MasterDataKey): key is "vendor" {
  return key === "vendor";
}

export function mapVendorLegacyRow(raw: unknown): VendorLegacyRow | null {
  const row = asRow(raw);

  const vendorCode = limitString(pickString(row, ["CardCode", "VendorCode", "Code"]), 20);
  if (!vendorCode) {
    return null;
  }

  const vendorName =
    limitString(pickString(row, ["CardName", "VendorName", "Name"]), 100) || vendorCode;

  return {
    vendorCode,
    vendorName,
    status: deriveVendorStatus(row),
    taxLink: 0,
    address: limitString(pickString(row, ["Address", "Address1", "Street", "BillToState"]), 500),
    fax: limitString(pickString(row, ["Fax"]), 500),
    // C# maps DebPayAcct → Email
    email: limitString(pickString(row, ["DebPayAcct", "E_Mail", "EMail", "Email", "EmailAddress"]), 500),
    tpNo: limitString(pickString(row, ["Phone1", "Phone", "Telephone"]), 500),
    currencyCode: limitString(pickString(row, ["Currency", "CurrencyCode"]), 50),
  };
}
