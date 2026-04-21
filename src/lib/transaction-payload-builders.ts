import { TransactionKey } from "@/types/transaction";

interface BuilderIssue {
  index: number;
  message: string;
}

interface BuilderResult {
  payloads: unknown[];
  issues: BuilderIssue[];
}

type Row = Record<string, unknown>;

function asRows(records: unknown[]): Row[] {
  return records.map((value) => (value ?? {}) as Row);
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

function pickDateString(row: Row, keys: string[]): string | undefined {
  const raw = pickString(row, keys);
  return raw.length > 0 ? raw : undefined;
}

function setIfDefined(target: Row, key: string, value: unknown): void {
  if (value !== undefined && value !== null && value !== "") {
    target[key] = value;
  }
}

function groupByDocumentNo(rows: Row[], keys: string[]): Map<string, Row[]> {
  const map = new Map<string, Row[]>();
  rows.forEach((row, index) => {
    const docNo = pickString(row, keys);
    const keyValue = docNo.length > 0 ? docNo : `__missing__${index}`;
    const bucket = map.get(keyValue) ?? [];
    bucket.push(row);
    map.set(keyValue, bucket);
  });
  return map;
}

function buildInventoryIssueOrReturnPayloads(
  records: unknown[],
  type: "issue" | "return"
): BuilderResult {
  const rows = asRows(records);
  const docNoKeys = type === "issue" ? ["IssueNo", "DocNo", "DocNum"] : ["ReturnNo", "DocNo", "DocNum"];
  const grouped = groupByDocumentNo(rows, docNoKeys);

  const payloads: Row[] = [];
  const issues: BuilderIssue[] = [];

  grouped.forEach((groupRows) => {
    const first = groupRows[0];
    const docNo = pickString(first, docNoKeys);

    if (docNo.length === 0) {
      issues.push({
        index: 0,
        message: `Missing document number for ${type} transaction group`,
      });
      return;
    }

    const lines: Row[] = [];

    groupRows.forEach((row, rowIndex) => {
      const itemCode = pickString(row, ["ItemCode", "StockCode"]);
      const quantity = pickNumber(row, ["IssueQty", "ReturnQty", "Quantity", "Qty"]);
      const warehouseCode = pickString(row, ["WHCode", "WhsCode", "WarehouseCode"]);

      if (!itemCode || quantity === null || quantity <= 0 || !warehouseCode) {
        issues.push({
          index: rowIndex,
          message: `${type} line missing ItemCode/Quantity/WarehouseCode`,
        });
        return;
      }

      const line: Row = {
        ItemCode: itemCode,
        Quantity: quantity,
        WarehouseCode: warehouseCode,
      };

      setIfDefined(line, "UnitPrice", pickNumber(row, ["Price", "UnitPrice", "CostPrice"]));
      setIfDefined(line, "ProjectCode", pickString(row, ["ProjectCode", "PrjCode"]));
      setIfDefined(line, "CostingCode", pickString(row, ["OcrCode", "CostCenter1", "DistributionRule"]));
      setIfDefined(line, "CostingCode2", pickString(row, ["OcrCode2", "CostCenter2", "DistributionRule2"]));

      lines.push(line);
    });

    if (lines.length === 0) {
      issues.push({
        index: 0,
        message: `${type} document ${docNo} has no valid lines`,
      });
      return;
    }

    const payload: Row = {
      DocDate: pickDateString(first, ["IssueDate", "ReturnDate", "DocDate"]),
      TaxDate: pickDateString(first, ["IssueDate", "ReturnDate", "TaxDate", "DocDate"]),
      Comments: pickString(first, ["Note1", "Remarks", "Comment"]),
      JournalMemo: pickString(first, ["Note1", "Remarks", "Memo"]),
      DocumentLines: lines,
    };

    setIfDefined(payload, "DocDate", payload.DocDate);
    setIfDefined(payload, "TaxDate", payload.TaxDate);
    setIfDefined(payload, "Comments", payload.Comments);
    setIfDefined(payload, "JournalMemo", payload.JournalMemo);

    payloads.push(payload);
  });

  return { payloads, issues };
}

function buildInventoryTransferPayloads(records: unknown[]): BuilderResult {
  const rows = asRows(records);
  const grouped = groupByDocumentNo(rows, ["WHTransNo", "DocNo", "DocNum"]);

  const payloads: Row[] = [];
  const issues: BuilderIssue[] = [];

  grouped.forEach((groupRows) => {
    const first = groupRows[0];
    const transNo = pickString(first, ["WHTransNo", "DocNo", "DocNum"]);

    if (transNo.length === 0) {
      issues.push({ index: 0, message: "Missing transfer number for inventory-transfer group" });
      return;
    }

    const headerFromWhs = pickString(first, ["FromWhsCod", "FromWhsCode", "FromWarehouse", "FWhsCode"]);
    const headerToWhs = pickString(first, ["ToWhsCode", "WhsCodeTo", "ToWarehouse", "TWhsCode"]);

    if (!headerFromWhs || !headerToWhs) {
      issues.push({
        index: 0,
        message: `Transfer ${transNo} missing FromWarehouse/ToWarehouse`,
      });
      return;
    }

    const lines: Row[] = [];

    groupRows.forEach((row, rowIndex) => {
      const itemCode = pickString(row, ["ItemCode", "StockCode"]);
      const quantity = pickNumber(row, ["Quantity", "TransferQty", "Qty"]);
      const toWhs = pickString(row, ["ToWhsCode", "WhsCode", "WarehouseCode", "TWhsCode"]);
      const fromWhs = pickString(row, ["FromWhsCod", "FromWhsCode", "FWhsCode"]);

      if (!itemCode || quantity === null || quantity <= 0 || !toWhs) {
        issues.push({
          index: rowIndex,
          message: "inventory-transfer line missing ItemCode/Quantity/ToWarehouse",
        });
        return;
      }

      const line: Row = {
        ItemCode: itemCode,
        Quantity: quantity,
        WarehouseCode: toWhs,
      };

      setIfDefined(line, "FromWarehouseCode", fromWhs || headerFromWhs);
      setIfDefined(line, "ProjectCode", pickString(row, ["ProjectCode", "PrjCode"]));

      lines.push(line);
    });

    if (lines.length === 0) {
      issues.push({
        index: 0,
        message: `Transfer ${transNo} has no valid lines`,
      });
      return;
    }

    const payload: Row = {
      DocDate: pickDateString(first, ["WHTransDate", "DocDate"]),
      TaxDate: pickDateString(first, ["WHTransDate", "TaxDate", "DocDate"]),
      FromWarehouse: headerFromWhs,
      ToWarehouse: headerToWhs,
      Comments: pickString(first, ["Note1", "Remarks", "Comment"]),
      StockTransferLines: lines,
    };

    setIfDefined(payload, "DocDate", payload.DocDate);
    setIfDefined(payload, "TaxDate", payload.TaxDate);
    setIfDefined(payload, "Comments", payload.Comments);

    payloads.push(payload);
  });

  return { payloads, issues };
}

function buildMarketingDocumentPayloads(
  records: unknown[],
  type: "supplier-invoice" | "supplier-return" | "customer-invoice"
): BuilderResult {
  const rows = asRows(records);

  const docNoKeys =
    type === "supplier-invoice"
      ? ["APIssueNo", "InvoiceNo", "DocNo", "DocNum"]
      : type === "supplier-return"
      ? ["APReturnNo", "CRN_No", "DocNo", "DocNum"]
      : ["InvoiceNo", "DocNo", "DocNum"];

  const grouped = groupByDocumentNo(rows, docNoKeys);
  const payloads: Row[] = [];
  const issues: BuilderIssue[] = [];

  grouped.forEach((groupRows) => {
    const first = groupRows[0];
    const docNo = pickString(first, docNoKeys);

    if (docNo.length === 0) {
      issues.push({
        index: 0,
        message: `Missing document number for ${type} group`,
      });
      return;
    }

    const cardCode = pickString(first, ["CardCode", "SupplierCode", "CustomerCode", "BPCode"]);
    if (cardCode.length === 0) {
      issues.push({
        index: 0,
        message: `${type} document ${docNo} missing CardCode`,
      });
      return;
    }

    const lines: Row[] = [];

    groupRows.forEach((row, rowIndex) => {
      const itemCode = pickString(row, ["ItemCode", "StockCode"]);
      const quantity = pickNumber(row, ["Quantity", "Qty", "IssueQty", "ReturnQty"]);
      const warehouseCode = pickString(row, ["WhsCode", "WHCode", "WarehouseCode"]);
      const accountCode = pickString(row, ["AcctCode", "AccountCode", "GLAccount"]);

      // For service lines AccountCode can be used without ItemCode.
      if (!itemCode && !accountCode) {
        issues.push({
          index: rowIndex,
          message: `${type} line missing ItemCode/AccountCode`,
        });
        return;
      }

      if (quantity === null || quantity <= 0) {
        issues.push({
          index: rowIndex,
          message: `${type} line missing Quantity`,
        });
        return;
      }

      const line: Row = {
        Quantity: quantity,
      };

      setIfDefined(line, "ItemCode", itemCode);
      setIfDefined(line, "AccountCode", accountCode);
      setIfDefined(line, "WarehouseCode", warehouseCode);
      setIfDefined(line, "UnitPrice", pickNumber(row, ["UnitPrice", "Price", "Rate"]));
      setIfDefined(line, "VatGroup", pickString(row, ["VatCode", "TaxCode", "VATCode"]));
      setIfDefined(line, "ProjectCode", pickString(row, ["ProjectCode", "PrjCode"]));
      setIfDefined(line, "CostingCode", pickString(row, ["OcrCode", "CostCenter1", "DistributionRule"]));
      setIfDefined(line, "CostingCode2", pickString(row, ["OcrCode2", "CostCenter2", "DistributionRule2"]));
      setIfDefined(line, "CostingCode3", pickString(row, ["OcrCode3", "CostCenter3", "DistributionRule3"]));
      setIfDefined(line, "CostingCode4", pickString(row, ["OcrCode4", "CostCenter4", "DistributionRule4"]));
      setIfDefined(line, "CostingCode5", pickString(row, ["OcrCode5", "CostCenter5", "DistributionRule5"]));

      const baseType = pickNumber(row, ["BaseType"]);
      const baseEntry = pickNumber(row, ["BaseEntry"]);
      const baseLine = pickNumber(row, ["BaseLine", "LineNum"]);
      if (baseType !== null && baseEntry !== null && baseLine !== null) {
        setIfDefined(line, "BaseType", baseType);
        setIfDefined(line, "BaseEntry", baseEntry);
        setIfDefined(line, "BaseLine", baseLine);
      }

      lines.push(line);
    });

    if (lines.length === 0) {
      issues.push({
        index: 0,
        message: `${type} document ${docNo} has no valid lines`,
      });
      return;
    }

    const payload: Row = {
      CardCode: cardCode,
      DocDate: pickDateString(first, ["InvoiceDate", "APReturnDate", "DocDate", "IssueDate"]),
      TaxDate: pickDateString(first, ["InvoiceDate", "APReturnDate", "TaxDate", "DocDate"]),
      DocDueDate: pickDateString(first, ["DueDate", "DocDueDate", "InvoiceDate", "DocDate"]),
      NumAtCard: pickString(first, ["InvoiceNo", "APIssueNo", "APReturnNo", "CRN_No", "RefNo"]),
      Comments: pickString(first, ["Note1", "Remarks", "Comment"]),
      JournalMemo: pickString(first, ["Note1", "Remarks", "Memo"]),
      DocumentLines: lines,
    };

    setIfDefined(payload, "DocDate", payload.DocDate);
    setIfDefined(payload, "TaxDate", payload.TaxDate);
    setIfDefined(payload, "DocDueDate", payload.DocDueDate);
    setIfDefined(payload, "NumAtCard", payload.NumAtCard);
    setIfDefined(payload, "Comments", payload.Comments);
    setIfDefined(payload, "JournalMemo", payload.JournalMemo);

    payloads.push(payload);
  });

  return { payloads, issues };
}

function buildPurchaseRequestPayloads(records: unknown[]): BuilderResult {
  const rows = asRows(records);
  const grouped = groupByDocumentNo(rows, ["PORNo", "RequestNo", "DocNo", "DocNum"]);

  const payloads: Row[] = [];
  const issues: BuilderIssue[] = [];

  grouped.forEach((groupRows) => {
    const first = groupRows[0];
    const reqNo = pickString(first, ["PORNo", "RequestNo", "DocNo", "DocNum"]);

    if (reqNo.length === 0) {
      issues.push({ index: 0, message: "Missing request number for purchase-request group" });
      return;
    }

    const lines: Row[] = [];

    groupRows.forEach((row, rowIndex) => {
      const itemCode = pickString(row, ["ItemCode", "StockCode"]);
      const quantity = pickNumber(row, ["PORQty", "Quantity", "Qty"]);

      if (!itemCode || quantity === null || quantity <= 0) {
        issues.push({
          index: rowIndex,
          message: "purchase-request line missing ItemCode/Quantity",
        });
        return;
      }

      const line: Row = {
        ItemCode: itemCode,
        Quantity: quantity,
      };

      setIfDefined(line, "WarehouseCode", pickString(row, ["WhsCode", "WHCode", "WarehouseCode"]));
      setIfDefined(line, "ProjectCode", pickString(row, ["ProjectCode", "PrjCode"]));
      setIfDefined(line, "RequiredDate", pickDateString(row, ["RequiredDate", "NeedDate", "DocDate"]));
      setIfDefined(line, "CostingCode", pickString(row, ["OcrCode", "CostCenter1", "DistributionRule"]));
      setIfDefined(line, "FreeText", pickString(row, ["LineRemarks", "Remarks"]));

      lines.push(line);
    });

    if (lines.length === 0) {
      issues.push({
        index: 0,
        message: `purchase-request document ${reqNo} has no valid lines`,
      });
      return;
    }

    const payload: Row = {
      DocDate: pickDateString(first, ["PORDate", "DocDate"]),
      RequriedDate: pickDateString(first, ["RequiredDate", "NeedDate", "PORDate", "DocDate"]),
      Comments: pickString(first, ["Note1", "Remarks", "Comment"]),
      Requester: pickString(first, ["UserID", "Requester", "AppUser"]),
      DocumentLines: lines,
    };

    setIfDefined(payload, "DocDate", payload.DocDate);
    setIfDefined(payload, "RequriedDate", payload.RequriedDate);
    setIfDefined(payload, "Comments", payload.Comments);
    setIfDefined(payload, "Requester", payload.Requester);

    payloads.push(payload);
  });

  return { payloads, issues };
}

function buildProjectPostingPayloads(records: unknown[]): BuilderResult {
  const rows = asRows(records);
  const payloads: Row[] = [];
  const issues: BuilderIssue[] = [];

  rows.forEach((row, index) => {
    const code = pickString(row, ["EstimateNo", "PrjCode", "Code", "ProjectCode"]);
    const name = pickString(row, ["ProjectName", "PrjName", "Name"]);

    if (!code || !name) {
      issues.push({
        index,
        message: "project-posting record missing ProjectCode/ProjectName",
      });
      return;
    }

    const payload: Row = {
      Code: code,
      Name: name,
    };

    setIfDefined(payload, "Active", pickString(row, ["Active", "Status"]));
    setIfDefined(payload, "ValidFrom", pickDateString(row, ["StartDate", "FromDate", "DocDate"]));
    setIfDefined(payload, "ValidTo", pickDateString(row, ["EndDate", "ToDate", "DocDate"]));

    payloads.push(payload);
  });

  return { payloads, issues };
}

function buildJournalEntryPayloads(
  records: unknown[],
  type: "gl-issue" | "gl-return" | "labour-issue" | "labour-return" | "machine-issue" | "machine-return"
): BuilderResult {
  const rows = asRows(records);

  const grouped = groupByDocumentNo(
    rows,
    type === "machine-issue" || type === "machine-return"
      ? ["IssueNo", "ReturnNo", "DocNo", "DocNum", "RefNo"]
      : ["DocNo", "DocNum", "RefNo", "BatchNo"]
  );

  const payloads: Row[] = [];
  const issues: BuilderIssue[] = [];

  grouped.forEach((groupRows) => {
    const first = groupRows[0];
    const lines: Row[] = [];

    groupRows.forEach((row, rowIndex) => {
      const accountCode = pickString(row, ["AccountCode", "AcctCode", "GLAccount", "ContraAct"]);
      const debit = pickNumber(row, ["Debit", "DebitAmount", "IssueAmount", "AmountDr"]);
      const credit = pickNumber(row, ["Credit", "CreditAmount", "ReturnAmount", "AmountCr"]);

      if (!accountCode) {
        issues.push({
          index: rowIndex,
          message: `${type} line missing AccountCode`,
        });
        return;
      }

      if ((debit === null || debit <= 0) && (credit === null || credit <= 0)) {
        issues.push({
          index: rowIndex,
          message: `${type} line requires Debit or Credit value`,
        });
        return;
      }

      const line: Row = {
        AccountCode: accountCode,
      };

      setIfDefined(line, "Debit", debit !== null && debit > 0 ? debit : undefined);
      setIfDefined(line, "Credit", credit !== null && credit > 0 ? credit : undefined);
      setIfDefined(line, "ShortName", pickString(row, ["ShortName", "CardCode", "BPCode"]));
      setIfDefined(line, "LineMemo", pickString(row, ["LineMemo", "Remarks", "Note1"]));
      setIfDefined(line, "ReferenceDate1", pickDateString(row, ["RefDate", "DocDate"]));
      setIfDefined(line, "DueDate", pickDateString(row, ["DueDate", "DocDate"]));
      setIfDefined(line, "TaxDate", pickDateString(row, ["TaxDate", "DocDate"]));
      setIfDefined(line, "ProjectCode", pickString(row, ["ProjectCode", "PrjCode"]));
      setIfDefined(line, "CostingCode", pickString(row, ["OcrCode", "CostCenter1", "DistributionRule"]));
      setIfDefined(line, "CostingCode2", pickString(row, ["OcrCode2", "CostCenter2", "DistributionRule2"]));
      setIfDefined(line, "CostingCode3", pickString(row, ["OcrCode3", "CostCenter3", "DistributionRule3"]));
      setIfDefined(line, "CostingCode4", pickString(row, ["OcrCode4", "CostCenter4", "DistributionRule4"]));
      setIfDefined(line, "CostingCode5", pickString(row, ["OcrCode5", "CostCenter5", "DistributionRule5"]));

      lines.push(line);
    });

    if (lines.length === 0) {
      issues.push({
        index: 0,
        message: `${type} document has no valid journal lines`,
      });
      return;
    }

    const payload: Row = {
      ReferenceDate: pickDateString(first, ["DocDate", "RefDate"]),
      DueDate: pickDateString(first, ["DueDate", "DocDate"]),
      TaxDate: pickDateString(first, ["TaxDate", "DocDate"]),
      Memo: pickString(first, ["Remarks", "Note1", "Memo"]),
      Reference: pickString(first, ["RefNo", "DocNo", "DocNum"]),
      JournalEntryLines: lines,
    };

    setIfDefined(payload, "ReferenceDate", payload.ReferenceDate);
    setIfDefined(payload, "DueDate", payload.DueDate);
    setIfDefined(payload, "TaxDate", payload.TaxDate);
    setIfDefined(payload, "Memo", payload.Memo);
    setIfDefined(payload, "Reference", payload.Reference);

    payloads.push(payload);
  });

  return { payloads, issues };
}

function buildDownPaymentPayloads(
  records: unknown[],
  type: "subcon-mobilization" | "subcon-retention" | "customer-mobilization" | "customer-retention"
): BuilderResult {
  const rows = asRows(records);

  const grouped = groupByDocumentNo(
    rows,
    type === "subcon-mobilization" || type === "subcon-retention"
      ? ["SubConMobRefNo", "SubConRetRefNo", "DocNo", "DocNum"]
      : ["CustMobRefNo", "CustRetRefNo", "DocNo", "DocNum"]
  );

  const payloads: Row[] = [];
  const issues: BuilderIssue[] = [];

  grouped.forEach((groupRows) => {
    const first = groupRows[0];
    const cardCode = pickString(first, ["CardCode", "SupplierCode", "CustomerCode", "BPCode"]);

    if (!cardCode) {
      issues.push({
        index: 0,
        message: `${type} document missing CardCode`,
      });
      return;
    }

    const lineAccount = pickString(first, ["AcctCode", "AccountCode", "GLAccount"]);
    const amount = pickNumber(first, ["Amount", "DocTotal", "AdvanceAmount", "RetentionAmount"]);

    if (!lineAccount || amount === null || amount <= 0) {
      issues.push({
        index: 0,
        message: `${type} requires AccountCode and positive Amount`,
      });
      return;
    }

    const lines: Row[] = [
      {
        AccountCode: lineAccount,
        Amount: amount,
      },
    ];

    const payload: Row = {
      CardCode: cardCode,
      DocDate: pickDateString(first, ["DocDate", "RefDate"]),
      TaxDate: pickDateString(first, ["TaxDate", "DocDate"]),
      DocDueDate: pickDateString(first, ["DueDate", "DocDate"]),
      NumAtCard: pickString(first, ["RefNo", "SubConMobRefNo", "SubConRetRefNo", "CustMobRefNo", "CustRetRefNo"]),
      Remarks: pickString(first, ["Remarks", "Note1", "Comment"]),
      DownPaymentType: pickString(first, ["DownPaymentType"]),
      DownPaymentAmount: amount,
      DownPaymentDetails: lines,
    };

    setIfDefined(payload, "DocDate", payload.DocDate);
    setIfDefined(payload, "TaxDate", payload.TaxDate);
    setIfDefined(payload, "DocDueDate", payload.DocDueDate);
    setIfDefined(payload, "NumAtCard", payload.NumAtCard);
    setIfDefined(payload, "Remarks", payload.Remarks);
    setIfDefined(payload, "DownPaymentType", payload.DownPaymentType);

    payloads.push(payload);
  });

  return { payloads, issues };
}

export function buildTransactionPayloads(key: TransactionKey, records: unknown[]): BuilderResult {
  if (records.length === 0) {
    return { payloads: [], issues: [] };
  }

  if (key === "inventory-issue") {
    return buildInventoryIssueOrReturnPayloads(records, "issue");
  }

  if (key === "inventory-return") {
    return buildInventoryIssueOrReturnPayloads(records, "return");
  }

  if (key === "inventory-transfer") {
    return buildInventoryTransferPayloads(records);
  }

  if (key === "supplier-invoice" || key === "supplier-issue") {
    return buildMarketingDocumentPayloads(records, "supplier-invoice");
  }

  if (key === "supplier-return") {
    return buildMarketingDocumentPayloads(records, "supplier-return");
  }

  if (key === "subcon-invoice") {
    return buildMarketingDocumentPayloads(records, "supplier-invoice");
  }

  if (key === "subcon-return") {
    return buildMarketingDocumentPayloads(records, "supplier-return");
  }

  if (key === "customer-invoice") {
    return buildMarketingDocumentPayloads(records, "customer-invoice");
  }

  if (key === "customer-credit-note" || key === "customer-return") {
    // Credit note uses the same SAP marketing document envelope as invoice.
    return buildMarketingDocumentPayloads(records, "customer-invoice");
  }

  if (key === "purchase-request" || key === "inventory-po-request") {
    return buildPurchaseRequestPayloads(records);
  }

  if (key === "project-posting" || key === "project-export") {
    return buildProjectPostingPayloads(records);
  }

  if (key === "gl-issue" || key === "gl-return" || key === "labour-issue" || key === "labour-return" || key === "machine-issue" || key === "machine-return") {
    return buildJournalEntryPayloads(records, key);
  }

  if (key === "subcon-mobilization" || key === "subcon-retention" || key === "customer-mobilization" || key === "customer-retention") {
    return buildDownPaymentPayloads(records, key);
  }

  return { payloads: records, issues: [] };
}
