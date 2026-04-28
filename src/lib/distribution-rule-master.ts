import { MasterDataKey } from "@/types/master-data";

type Row = Record<string, unknown>;

export interface DistributionRuleLegacyRow {
  ocrCode: string;
  ocrName: string;
  ruleNo: number;
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

function deriveDistributionRuleStatus(row: Row): boolean {
  const active = pickString(row, ["Active", "active", "Status"]);
  if (!active) {
    return true;
  }

  const normalized = active.trim().toUpperCase();

  if (["Y", "YES", "TRUE", "1", "TYES"].includes(normalized)) {
    return true;
  }

  if (["N", "NO", "FALSE", "0", "TNO"].includes(normalized)) {
    return false;
  }

  return true;
}

export function isDistributionRulesKey(key: MasterDataKey): key is "distribution-rules" {
  return key === "distribution-rules";
}

export function mapDistributionRuleLegacyRow(raw: unknown): DistributionRuleLegacyRow | null {
  const row = asRow(raw);

  const ocrCode = limitString(pickString(row, ["OcrCode", "FactorCode", "Code"]), 20);
  if (!ocrCode) {
    return null;
  }

  return {
    ocrCode,
    ocrName:
      limitString(pickString(row, ["OcrName", "FactorName", "Name"]), 100) || ocrCode,
    ruleNo: pickNumber(row, ["DimCode", "RuleNo", "Level"]) ?? 0,
    active: deriveDistributionRuleStatus(row),
  };
}