import { MasterDataKey } from "@/types/master-data";

type Row = Record<string, unknown>;

export interface ProjectLegacyRow {
  projectCode: string;
  projectName: string;
  activeProject: boolean;
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

function parseActiveProject(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value !== 0;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toUpperCase();
    if (["Y", "YES", "TRUE", "1", "TYES"].includes(normalized)) {
      return true;
    }
    if (["N", "NO", "FALSE", "0", "TNO"].includes(normalized)) {
      return false;
    }
  }

  return true;
}

export function isProjectKey(key: MasterDataKey): key is "project" {
  return key === "project";
}

export function mapProjectLegacyRow(raw: unknown): ProjectLegacyRow | null {
  const row = asRow(raw);

  const projectCode = limitString(pickString(row, ["PrjCode", "ProjectCode", "Code"]), 20);
  if (!projectCode) {
    return null;
  }

  const projectName =
    limitString(pickString(row, ["PrjName", "ProjectName", "Name"]), 200) || projectCode;

  return {
    projectCode,
    projectName,
    activeProject: parseActiveProject(row.Active),
  };
}
