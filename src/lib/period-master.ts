import { MasterDataKey } from "@/types/master-data";

type Row = Record<string, unknown>;

export interface PeriodLegacyRow {
  periodCode: string;
  periodName: string;
  startDate: Date;
  endDate: Date;
  periodStat: boolean;
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

function derivePeriodStat(row: Row): boolean {
  const rawStatus = pickString(row, ["PeriodStat", "PeriodStatus", "Status"]);
  if (rawStatus) {
    const normalized = rawStatus.trim().toUpperCase();
    if (["Y", "C", "CLOSED", "LOCKED", "INACTIVE"].includes(normalized)) {
      return false;
    }
    if (["N", "O", "OPEN", "ACTIVE", "UNLOCKED"].includes(normalized)) {
      return true;
    }
  }

  const parsed =
    parseBooleanLike(row.PeriodStat) ??
    parseBooleanLike(row.PeriodStatus) ??
    parseBooleanLike(row.Status) ??
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

export function isPeriodsKey(key: MasterDataKey): key is "periods" {
  return key === "periods";
}

export function mapPeriodLegacyRow(raw: unknown): PeriodLegacyRow | null {
  const row = asRow(raw);
  const periodCode = limitString(pickString(row, ["Code", "PeriodCode"]), 50);
  const startDate = pickDate(row, ["F_RefDate", "FromDate", "StartDate", "StartingDate"]);
  const endDate = pickDate(row, ["T_RefDate", "ToDate", "EndDate", "EndingDate"]);

  if (!periodCode || !startDate || !endDate) {
    return null;
  }

  const periodName =
    limitString(pickString(row, ["Name", "PeriodName"]), 100) ?? periodCode;

  return {
    periodCode,
    periodName,
    startDate,
    endDate,
    periodStat: derivePeriodStat(row),
  };
}