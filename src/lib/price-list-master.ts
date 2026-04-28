import { MasterDataKey } from "@/types/master-data";

type Row = Record<string, unknown>;

export interface PriceListLegacyRow {
  itemCode: string;
  priceListCode: string;
  listName: string;
  unitPrice: number;
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

export function isPriceListKey(key: MasterDataKey): key is "price-list" {
  return key === "price-list";
}

export function mapPriceListLegacyRows(raw: unknown): PriceListLegacyRow[] {
  const row = asRow(raw);
  const itemCode = limitString(pickString(row, ["ItemCode"]), 100);

  // SAP PriceLists endpoint often returns a header with nested lines.
  const lines = row.PriceListLines;
  if (Array.isArray(lines) && itemCode) {
    const mapped = lines
      .map((entry) => {
        const line = asRow(entry);
        const priceListCode = limitString(
          pickString(line, ["PriceList", "PriceListNo", "ListNum"]),
          100
        );
        if (!priceListCode) {
          return null;
        }

        return {
          itemCode,
          priceListCode,
          listName:
            limitString(
              pickString(line, ["ListName", "PriceListName", "ProjectCode", "PLName"]),
              100
            ) || priceListCode,
          unitPrice: pickNumber(line, ["Price", "PriceValue", "BasePrice"]) ?? 0,
        } satisfies PriceListLegacyRow;
      })
      .filter((entry): entry is PriceListLegacyRow => entry !== null);

    if (mapped.length > 0) {
      return mapped;
    }
  }

  const fallbackItemCode = limitString(pickString(row, ["ItemCode", "Code"]), 100);
  const fallbackPriceListCode = limitString(
    pickString(row, ["PriceList", "PriceListNo", "ListNum"]),
    100
  );

  if (!fallbackItemCode || !fallbackPriceListCode) {
    return [];
  }

  return [
    {
      itemCode: fallbackItemCode,
      priceListCode: fallbackPriceListCode,
      listName:
        limitString(pickString(row, ["ListName", "PriceListName", "ProjectCode", "PLName"]), 100) ||
        fallbackPriceListCode,
      unitPrice: pickNumber(row, ["Price", "PriceValue", "BasePrice"]) ?? 0,
    },
  ];
}
