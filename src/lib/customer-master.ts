import { MasterDataKey } from "@/types/master-data";

type Row = Record<string, unknown>;

export interface CustomerLegacyRow {
  custCode: string;
  custName: string;
  address1: string;
  address2: string;
  address3: string;
  address4: string;
  country: string;
  address1P: string;
  address2P: string;
  address3P: string;
  address4P: string;
  countryP: string;
  bRegNo: string;
  tpNo: string;
  fax: string;
  email: string;
  vatNo: string;
  svatNo: string;
  taxStatus: string;
  settlementTermsId: number;
  customerType: string;
  custGrp: string;
  repId: string;
  nic: string;
  remarks: string;
  insuranceCustomer: string;
  status: boolean;
  contactPerson: string;
  currencyCode: string;
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

function parseBooleanLike(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value !== 0;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toUpperCase();

    if (["1", "TRUE", "YES", "Y", "TYES"].includes(normalized)) {
      return true;
    }

    if (["0", "FALSE", "NO", "N", "TNO"].includes(normalized)) {
      return false;
    }
  }

  return null;
}

function deriveCustomerStatus(row: Row): boolean {
  const frozen = pickString(row, ["frozenFor", "FrozenFor", "Frozen"]);

  if (frozen) {
    const normalized = frozen.trim().toUpperCase();

    if (["N", "TNO", "FALSE", "0", "NO"].includes(normalized)) {
      return true;
    }

    if (["Y", "TYES", "TRUE", "1", "YES"].includes(normalized)) {
      return false;
    }
  }

  const active = parseBooleanLike(row.Active);
  if (active !== null) {
    return active;
  }

  const inactive = parseBooleanLike(row.Inactive);
  if (inactive !== null) {
    return !inactive;
  }

  return true;
}

export function isCustomerMasterKey(key: MasterDataKey): key is "customer" {
  return key === "customer";
}

export function mapCustomerLegacyRow(raw: unknown): CustomerLegacyRow | null {
  const row = asRow(raw);

  const custCode = limitString(pickString(row, ["CardCode", "CustomerCode", "Code"]), 100);
  if (!custCode) {
    return null;
  }

  const country = limitString(pickString(row, ["Country", "CountryCode"]), 50);
  const customerName =
    limitString(pickString(row, ["CardName", "CustomerName", "Name"]), 200) || custCode;

  return {
    custCode,
    custName: customerName,
    address1: limitString(pickString(row, ["Address", "Address1", "Street"]), 200),
    address2: country,
    address3: "",
    address4: "",
    country,
    address1P: "",
    address2P: "",
    address3P: "",
    address4P: "",
    countryP: country,
    bRegNo: "",
    tpNo: limitString(pickString(row, ["Phone1", "Phone", "Telephone"]), 100),
    fax: limitString(pickString(row, ["Fax"]), 100),
    email: limitString(pickString(row, ["E_Mail", "EMail", "Email", "EmailAddress"]), 200),
    vatNo: limitString(pickString(row, ["VatRegNum", "VATRegNum", "FederalTaxID", "VATNo"]), 100),
    svatNo: limitString(pickString(row, ["VatRegNum", "VATRegNum", "FederalTaxID", "SVATNo"]), 100),
    taxStatus: limitString(pickString(row, ["VatStatus", "VATStatus", "VatLiable", "TaxStatus"]), 50),
    settlementTermsId: 0,
    customerType: limitString(pickString(row, ["CardType", "CustomerType"]), 20),
    custGrp: limitString(pickString(row, ["GroupName", "CustGrp", "GroupCode", "GroupNum"]), 100),
    repId: limitString(pickString(row, ["SlpCode", "SalesPersonCode", "RepID"]), 50),
    nic: "",
    remarks: "",
    insuranceCustomer: "0",
    status: deriveCustomerStatus(row),
    contactPerson: limitString(pickString(row, ["CntctPrsn", "ContactPerson", "ContactEmployee"]), 100),
    currencyCode: limitString(pickString(row, ["Currency", "CurrencyCode"]), 50),
  };
}