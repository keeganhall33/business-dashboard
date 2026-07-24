import { loadProductConversionPrototype } from "@/lib/dashboard/product-conversion-prototype";

const data = loadProductConversionPrototype();

const summary = {
  rowCount: data.rows.length,
  names: data.rows.map((row) => row.productName),
  firstRowRanges: data.rows[0]?.ranges.map((range) => ({ range: range.range, label: range.label })),
  checklistCount: data.instrumentationChecklist.length,
  confidence: data.rows.map((row) => ({ name: row.productName, confidence: row.confidence })),
  limitations: data.notes,
  classifications: data.rows.map((row) => ({ name: row.productName, classification: row.classification }))
};

console.log(JSON.stringify(summary, null, 2));
