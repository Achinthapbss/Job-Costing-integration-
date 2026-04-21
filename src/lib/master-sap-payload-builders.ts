import { MasterDataKey } from "@/types/master-data";

type Row = Record<string, unknown>;

function asRow(value: unknown): Row {
  return (value ?? {}) as Row;
}

function pickString(row: Row, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return "";
}

function pickNumber(row: Row, keys: string[]): number | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

function pickDateString(row: Row, keys: string[]): string {
  return pickString(row, keys);
}

function setIfDefined(target: Row, key: string, value: unknown): void {
  if (value !== undefined && value !== null && value !== "") {
    target[key] = value;
  }
}

function stripMetadata(row: Row): Row {
  const ignored = new Set([
    "odata.metadata",
    "odata.etag",
    "__metadata",
    "CreateDate",
    "CreateTime",
    "UpdateDate",
    "UpdateTime",
    "DataSource",
    "UserSign",
    "UserSign2",
  ]);

  const cleaned: Row = {};
  Object.keys(row).forEach((key) => {
    if (ignored.has(key)) {
      return;
    }
    cleaned[key] = row[key];
  });

  return cleaned;
}

function buildWarehousePayload(raw: unknown): Row {
  const row = stripMetadata(asRow(raw));
  const payload: Row = {};

  setIfDefined(payload, "WarehouseCode", pickString(row, ["WarehouseCode", "WhsCode", "Code"]));
  setIfDefined(payload, "WarehouseName", pickString(row, ["WarehouseName", "WhsName", "Name"]));
  setIfDefined(payload, "Inactive", row.Inactive);
  setIfDefined(payload, "Location", row.Location);

  return Object.keys(payload).length > 0 ? payload : row;
}

function buildUomPayload(raw: unknown): Row {
  const row = stripMetadata(asRow(raw));
  const payload: Row = {};

  setIfDefined(payload, "UoMCode", pickString(row, ["UoMCode", "Code", "UOMCode"]));
  setIfDefined(payload, "UoMName", pickString(row, ["UoMName", "Name", "UOMName"]));
  setIfDefined(payload, "BaseQuantity", pickNumber(row, ["BaseQuantity", "BaseQty", "BaseQuant"]));

  return Object.keys(payload).length > 0 ? payload : row;
}

function buildTaxPayload(raw: unknown): Row {
  const row = stripMetadata(asRow(raw));
  const payload: Row = {};

  setIfDefined(payload, "Code", pickString(row, ["Code", "VatCode", "TaxCode"]));
  setIfDefined(payload, "Name", pickString(row, ["Name", "VatName", "TaxName"]));
  setIfDefined(payload, "Rate", pickNumber(row, ["Rate", "TaxRate", "VatPercent"]));
  setIfDefined(payload, "Category", row.Category);

  return Object.keys(payload).length > 0 ? payload : row;
}

function buildPeriodPayload(raw: unknown): Row {
  const row = stripMetadata(asRow(raw));
  const payload: Row = {};

  setIfDefined(payload, "PeriodCode", pickString(row, ["PeriodCode", "Code"]));
  setIfDefined(payload, "PeriodName", pickString(row, ["PeriodName", "Name"]));
  setIfDefined(payload, "SubPeriod", row.SubPeriod);
  setIfDefined(payload, "FromDate", pickDateString(row, ["FromDate", "StartDate", "F_RefDate"]));
  setIfDefined(payload, "ToDate", pickDateString(row, ["ToDate", "EndDate", "T_RefDate"]));

  return Object.keys(payload).length > 0 ? payload : row;
}

function buildCurrencyRatePayload(raw: unknown): Row {
  const row = stripMetadata(asRow(raw));
  const payload: Row = {};

  setIfDefined(payload, "Currency", pickString(row, ["Currency", "CurrencyCode", "ISOCode"]));
  setIfDefined(payload, "Rate", pickNumber(row, ["Rate", "ExchangeRate", "CurrencyRate"]));
  setIfDefined(payload, "Date", pickDateString(row, ["Date", "RateDate", "DocDate"]));

  return Object.keys(payload).length > 0 ? payload : row;
}

export function buildMasterSapPayload(key: MasterDataKey, raw: unknown): Row {
  if (key === "warehouse-master" || key === "warehouses") {
    return buildWarehousePayload(raw);
  }

  if (key === "uom") {
    return buildUomPayload(raw);
  }

  if (key === "tax-codes") {
    return buildTaxPayload(raw);
  }

  if (key === "periods") {
    return buildPeriodPayload(raw);
  }

  if (key === "currency-rates") {
    return buildCurrencyRatePayload(raw);
  }

  return stripMetadata(asRow(raw));
}
