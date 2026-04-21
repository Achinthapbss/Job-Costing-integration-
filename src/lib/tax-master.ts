import { MasterDataKey } from "@/types/master-data";

type Row = Record<string, unknown>;

export interface TaxCodeLegacyRow {
  vatCode: string;
  description: string;
  percentage: number;
  isActive: boolean;
  taxType: string;
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
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "y"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "n"].includes(normalized)) {
      return false;
    }
  }

  return null;
}

function deriveActive(row: Row): boolean {
  const locked = pickString(row, ["Locked"]);
  if (locked) {
    return locked.toUpperCase() === "N";
  }

  const parsed =
    parseBooleanLike(row.isActive) ??
    parseBooleanLike(row.IsActive) ??
    parseBooleanLike(row.Active) ??
    parseBooleanLike(row.Inactive);

  if (parsed === null) {
    return true;
  }

  if (row.Inactive !== undefined) {
    return !parsed;
  }

  return parsed;
}

export function isTaxCodesKey(key: MasterDataKey): key is "tax-codes" {
  return key === "tax-codes";
}

export function mapTaxCodeLegacyRow(raw: unknown): TaxCodeLegacyRow | null {
  const row = asRow(raw);

  if (Object.prototype.hasOwnProperty.call(row, "Account")) {
    const account = pickString(row, ["Account"]);
    if (!account) {
      return null;
    }
  }

  const vatCode = limitString(pickString(row, ["Code", "VatCode", "TaxCode"]), 20);
  const percentage = pickNumber(row, ["Rate", "Persenatge", "VATPcntage", "TaxRate", "VatPercent"]);

  if (!vatCode || percentage === null) {
    return null;
  }

  const description = pickString(row, ["Name", "Description", "VatName", "TaxName"]) ?? vatCode;
  const taxType = limitString(pickString(row, ["Category", "TaxType", "Type"]), 1) ?? "";

  return {
    vatCode,
    description,
    percentage,
    isActive: deriveActive(row),
    taxType,
  };
}