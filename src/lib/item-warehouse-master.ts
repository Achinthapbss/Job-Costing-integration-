import { MasterDataKey } from "@/types/master-data";

type Row = Record<string, unknown>;

export interface ItemWarehouseLegacyRow {
  itemCode: string;
  warehouseCode: string;
  qtyOnHand: number;
  idUnits: number;
  qtyOnOrder: number;
  qtyOnAvailable: number;
  glAccountSales: string;
  glAccountCostOfSale: string;
  lastUnitCost: number;
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

function mapFlatItemWarehouseRow(raw: unknown, fallbackItemCode?: string): ItemWarehouseLegacyRow | null {
  const row = asRow(raw);
  const itemCode = limitString(pickString(row, ["ItemCode", "StockCode", "Code"]), 100) ?? fallbackItemCode ?? null;
  const warehouseCode = limitString(
    pickString(row, ["WhsCode", "WarehouseCode", "WhseCode", "Warehouse"]),
    100
  );

  if (!itemCode || !warehouseCode) {
    return null;
  }

  const qtyOnHand = pickNumber(row, ["OnHand", "InStock", "QtyOnHand"]) ?? 0;
  const qtyOnOrder = pickNumber(row, ["OnOrder", "Ordered", "QtyOnOrder"]) ?? 0;
  const qtyOnAvailable = pickNumber(row, ["QtyOnAvailable", "Available", "AvailableQty"]) ?? qtyOnHand;
  const lastUnitCost = pickNumber(row, ["AvgPrice", "AveragePrice", "LastUnitCost"]) ?? 0;

  return {
    itemCode,
    warehouseCode,
    qtyOnHand,
    idUnits: 0,
    qtyOnOrder,
    qtyOnAvailable,
    glAccountSales: "",
    glAccountCostOfSale: "",
    lastUnitCost,
  };
}

export function isItemWarehousesKey(key: MasterDataKey): key is "item-warehouses" {
  return key === "item-warehouses";
}

export function countItemWarehouseCandidates(raw: unknown): number {
  const row = asRow(raw);
  const collection = row.ItemWarehouseInfoCollection;

  if (Array.isArray(collection)) {
    return collection.length;
  }

  return 1;
}

export function mapItemWarehouseLegacyRows(raw: unknown): ItemWarehouseLegacyRow[] {
  const row = asRow(raw);
  const itemCode = limitString(pickString(row, ["ItemCode", "StockCode", "Code"]), 100);
  const collection = row.ItemWarehouseInfoCollection;

  if (Array.isArray(collection) && itemCode) {
    return collection
      .map((entry) => mapFlatItemWarehouseRow(entry, itemCode))
      .filter((entry): entry is ItemWarehouseLegacyRow => entry !== null);
  }

  const flatRow = mapFlatItemWarehouseRow(raw, itemCode ?? undefined);
  return flatRow ? [flatRow] : [];
}