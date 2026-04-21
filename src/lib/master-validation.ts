import { MasterDataKey } from "@/types/master-data";

export interface ValidationIssue {
  index: number;
  key: MasterDataKey;
  missingFields: string[];
}

export interface ValidationResult {
  totalCount: number;
  validCount: number;
  invalidCount: number;
  validRecords: unknown[];
  issues: ValidationIssue[];
}

type RawRecord = Record<string, unknown>;

interface ValidationRule {
  anyOfFields: string[];
}

const validationRules: Partial<Record<MasterDataKey, ValidationRule>> = {
  currency: { anyOfFields: ["CurrCode", "Currency", "Code", "CurrName", "Name"] },
  currencies: { anyOfFields: ["CurrCode", "Currency", "Code", "CurrName", "Name"] },
  customer: { anyOfFields: ["CardCode", "CardName"] },
  "customer-currencies": { anyOfFields: ["CardCode", "Currency"] },
  vendor: { anyOfFields: ["CardCode", "CardName"] },
  item: { anyOfFields: ["ItemCode", "ItemName"] },
  "item-group": { anyOfFields: ["ItmsGrpCod", "Number", "ItmsGrpNam", "GroupName"] },
  "item-group-accounts": { anyOfFields: ["ItmsGrpCod", "Number", "InventoryAccount"] },
  "warehouse-master": { anyOfFields: ["WhsCode", "WarehouseCode", "WhsName", "WarehouseName"] },
  warehouses: { anyOfFields: ["WhsCode", "WarehouseCode", "WhsName", "WarehouseName"] },
  "item-warehouses": { anyOfFields: ["ItemCode", "ItemWarehouseInfoCollection"] },
  "uom-group": { anyOfFields: ["UgpEntry", "AbsEntry", "UgpName", "Name"] },
  "price-list": { anyOfFields: ["PriceListNo", "ListNum", "PriceListName", "ListName"] },
  periods: { anyOfFields: ["Code", "Name", "PeriodCode", "PeriodName"] },
  "currency-rates": { anyOfFields: ["Currency", "Rate", "RateDate"] },
  project: { anyOfFields: ["PrjCode", "Code", "PrjName", "Name"] },
  uom: { anyOfFields: ["UomEntry", "AbsEntry", "UomCode", "Code"] },
  "uom-conversion": { anyOfFields: ["UomEntry", "UgpEntry", "AltQty", "BaseQty"] },
  "distribution-rules": { anyOfFields: ["OcrCode", "FactorCode", "DimCode"] },
  accounts: { anyOfFields: ["AcctCode", "Code", "AcctName", "Name"] },
  "tax-codes": { anyOfFields: ["Code", "Name", "Rate"] },
  "login-users": { anyOfFields: ["USERID", "USER_CODE", "U_NAME"] },
  bank: { anyOfFields: ["BankCode", "BankName"] },
  branch: { anyOfFields: ["BranchCode", "BranchName", "BankCode"] },
  "serial-numbers": { anyOfFields: ["ItemCode", "MnfSerial", "SerialNumber", "Quantity"] },
  "sales-rep": { anyOfFields: ["SlpCode", "SalesEmployeeCode", "SlpName", "SalesEmployeeName"] },
};

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return true;
}

export function validateMasterRecords(
  key: MasterDataKey,
  records: unknown[],
  maxErrors: number
): ValidationResult {
  const rule = validationRules[key];

  if (!rule) {
    return {
      totalCount: records.length,
      validCount: records.length,
      invalidCount: 0,
      validRecords: records,
      issues: [],
    };
  }

  const issues: ValidationIssue[] = [];
  const validRecords: unknown[] = [];

  records.forEach((record, index) => {
    const raw = (record ?? {}) as RawRecord;

    const hasAnyField = rule.anyOfFields.some((field) => hasValue(raw[field]));
    if (!hasAnyField) {
      if (issues.length < maxErrors) {
        issues.push({
          index,
          key,
          missingFields: rule.anyOfFields,
        });
      }
      return;
    }

    validRecords.push(record);
  });

  return {
    totalCount: records.length,
    validCount: validRecords.length,
    invalidCount: records.length - validRecords.length,
    validRecords,
    issues,
  };
}
