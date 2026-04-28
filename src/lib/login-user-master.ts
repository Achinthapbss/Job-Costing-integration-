import { MasterDataKey } from "@/types/master-data";

type Row = Record<string, unknown>;

export interface LoginUserLegacyRow {
  userCode: string;
  userId: number;
  userName: string;
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

function deriveActiveFromLocked(row: Row): boolean {
  const locked = pickString(row, ["Locked", "locked", "IsLocked"]);
  if (!locked) {
    return true;
  }

  return locked.trim().toUpperCase() === "N";
}

export function isLoginUsersKey(key: MasterDataKey): key is "login-users" | "users" {
  return key === "login-users" || key === "users";
}

export function mapLoginUserLegacyRow(raw: unknown): LoginUserLegacyRow | null {
  const row = asRow(raw);

  const userCode = limitString(
    pickString(row, ["USER_CODE", "UserCode", "USERID", "UserID"]),
    50
  );
  if (!userCode) {
    return null;
  }

  const parsedUserId = pickNumber(row, ["USERID", "UserID", "Id"]);

  return {
    userCode,
    userId: parsedUserId ?? 0,
    userName: limitString(pickString(row, ["U_NAME", "UserName", "Name"]), 120) || userCode,
    active: deriveActiveFromLocked(row),
  };
}