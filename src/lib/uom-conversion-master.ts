import { MasterDataKey } from "@/types/master-data";

type Row = Record<string, unknown>;

export interface UomConversionLegacyRow {
  baseQty: number;
  uomEntry: number;
  ugpCode: string;
  ugpName: string;
  uomCode: string;
  uomName: string;
  baseUom: number | null;
}

export interface UomFormulaLegacyRow {
  ugpEntry: number;
  baseQty: number;
  uomEntry: number;
  altQty: number;
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

function mapFromFlatRow(row: Row): { conversion: UomConversionLegacyRow; formula: UomFormulaLegacyRow } | null {
  const uomEntry = pickNumber(row, ["UomEntry", "UoMEntry"]);
  const ugpEntry = pickNumber(row, ["UgpEntry", "AbsEntry"]);
  const baseQty = pickNumber(row, ["BaseQty", "AltQty"]);
  const altQty = pickNumber(row, ["AltQty", "BaseQty"]);

  if (uomEntry === null || ugpEntry === null || baseQty === null || altQty === null) {
    return null;
  }

  return {
    conversion: {
      baseQty,
      uomEntry,
      ugpCode: limitString(pickString(row, ["UgpCode", "Code"]), 100) || String(ugpEntry),
      ugpName: limitString(pickString(row, ["UgpName", "Name"]), 500),
      uomCode: limitString(pickString(row, ["UomCode", "UoMCode"]), 100) || String(uomEntry),
      uomName: limitString(pickString(row, ["UomName", "UoMName"]), 500),
      baseUom: pickNumber(row, ["BaseUom", "BaseUoM", "BaseUomEntry"]),
    },
    formula: {
      ugpEntry,
      baseQty,
      uomEntry,
      altQty,
    },
  };
}

export function isUomConversionKey(key: MasterDataKey): key is "uom-conversion" {
  return key === "uom-conversion";
}

export function mapUomConversionLegacyRows(rawRecords: unknown[]): {
  conversions: UomConversionLegacyRow[];
  formulas: UomFormulaLegacyRow[];
} {
  const conversions: UomConversionLegacyRow[] = [];
  const formulas: UomFormulaLegacyRow[] = [];

  for (const raw of rawRecords) {
    const row = asRow(raw);

    // Preferred SAP shape: group header + UnitOfMeasurementGroupDefinitionCollection lines.
    const ugpEntry = pickNumber(row, ["UgpEntry", "AbsEntry", "Code"]);
    const ugpCode = limitString(pickString(row, ["UgpCode", "Code"]), 100);
    const ugpName = limitString(pickString(row, ["UgpName", "Name"]), 500);

    const lines = row.UnitOfMeasurementGroupDefinitionCollection;
    if (Array.isArray(lines) && lines.length > 0 && ugpEntry !== null) {
      for (const lineRaw of lines) {
        const line = asRow(lineRaw);
        const uomEntry = pickNumber(line, ["UomEntry", "UoMEntry", "AlternateUoM"]);
        const altQty = pickNumber(line, ["AltQty", "AlternateQuantity"]);
        const baseQty = pickNumber(line, ["BaseQty", "BaseQuantity"]);
        const baseUom = pickNumber(line, ["BaseUom", "BaseUoM", "BaseUomEntry", "BaseUoMEntry"]);

        if (uomEntry === null || altQty === null || baseQty === null) {
          continue;
        }

        conversions.push({
          baseQty: altQty,
          uomEntry,
          ugpCode: ugpCode || String(ugpEntry),
          ugpName,
          uomCode: limitString(pickString(line, ["UomCode", "UoMCode"]), 100) || String(uomEntry),
          uomName: limitString(pickString(line, ["UomName", "UoMName"]), 500),
          baseUom,
        });

        formulas.push({
          ugpEntry,
          baseQty,
          uomEntry,
          altQty,
        });
      }

      continue;
    }

    const flat = mapFromFlatRow(row);
    if (flat) {
      conversions.push(flat.conversion);
      formulas.push(flat.formula);
    }
  }

  return { conversions, formulas };
}
