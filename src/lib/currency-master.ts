import { MasterDataKey } from "@/types/master-data";

type Row = Record<string, unknown>;

export interface CurrencyLegacyRow {
  sectionId: number;
  currency: string;
  description: string;
}

export interface CurrencyRateLegacyRow {
  currency: string;
  rate: number;
  rateDate: Date;
}

export interface CustomerCurrencyLegacyRow {
  customerCode: string;
  currency: string;
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

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value;
    }

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        continue;
      }

      const parsed = new Date(trimmed);
      if (!Number.isNaN(parsed.getTime())) {
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

export function isCurrencyMasterKey(key: MasterDataKey): key is "currency" | "currencies" {
  return key === "currency" || key === "currencies";
}

export function isCurrencyRatesKey(key: MasterDataKey): key is "currency-rates" {
  return key === "currency-rates";
}

export function isCustomerCurrencyKey(key: MasterDataKey): key is "customer-currencies" {
  return key === "customer-currencies";
}

export function mapCurrencyLegacyRow(raw: unknown): CurrencyLegacyRow | null {
  const row = asRow(raw);
  const currency = limitString(pickString(row, ["CurrCode", "Currency", "Code", "ISOCurrencyCode"]), 20);

  if (!currency) {
    return null;
  }

  const description =
    limitString(pickString(row, ["CurrName", "Description", "Name", "CurrencyName"]), 500) ?? currency;

  return {
    sectionId: 0,
    currency,
    description,
  };
}

export function mapCurrencyRateLegacyRow(raw: unknown): CurrencyRateLegacyRow | null {
  const row = asRow(raw);
  const currency = limitString(pickString(row, ["Currency", "CurrCode", "CurrencyCode", "Code"]), 20);
  const rate = pickNumber(row, ["Rate", "ExchangeRate", "CurrencyRate"]);
  const rateDate = pickDate(row, ["RateDate", "Date", "DocDate"]);

  if (!currency || rate === null || !rateDate) {
    return null;
  }

  return {
    currency,
    rate,
    rateDate,
  };
}

export function mapCustomerCurrencyLegacyRow(raw: unknown): CustomerCurrencyLegacyRow | null {
  const row = asRow(raw);
  const customerCode = limitString(pickString(row, ["CardCode", "CustomerCode"]), 50);
  const currency = limitString(pickString(row, ["Currency", "CurrCode", "CurrencyCode"]), 50);

  if (!customerCode || !currency) {
    return null;
  }

  return {
    customerCode,
    currency,
  };
}