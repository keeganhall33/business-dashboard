import { writeFileSync } from "node:fs";
import path from "node:path";
import { loadProductConversionPrototype } from "@/lib/dashboard/product-conversion-prototype";

const data = loadProductConversionPrototype();
const rowsHtml = data.rows
  .map((row) => {
    const rangeBlocks = row.ranges
      .map((range) => `
        <div class="range-block">
          <div class="range-label">${range.label}</div>
          <div class="range-metric">Woo: ${formatCurrency(range.wooRevenue)} / ${formatNumber(range.wooUnits)} orders · AOV ${formatCurrency(range.wooAov)}</div>
          <div class="range-metric">GA4: ${formatNumber(range.gaViewItem)} view_item / ${formatNumber(range.gaAddToCart)} add_to_cart</div>
          <div class="range-note">View→Cart: ${formatPercent(range.gaViewToCartRate)}</div>
        </div>
      `)
      .join("");

    return `
      <section class="card">
        <header>
          <div>
            <div class="label">${row.productName}</div>
            ${row.priceLabel ? `<div class="subtle">${row.priceLabel}</div>` : ""}
            <div class="chips">
              <span class="chip confidence">${row.confidence.toUpperCase()}</span>
              ${row.instrumentationGap ? '<span class="chip alert">Instrumentation gap</span>' : ""}
            </div>
          </div>
          <div class="classification">${formatClassification(row.classification)}</div>
        </header>
        <p class="summary">${row.summary}</p>
        <p class="action">${row.recommendedAction}</p>
        <div class="ranges">${rangeBlocks}</div>
      </section>
    `;
  })
  .join("");

const checklistHtml = data.instrumentationChecklist
  .map((item) => `
    <div class="check-item ${item.status}">
      <strong>${capitalize(item.status)}</strong>: ${item.label}
      <div class="detail">${item.detail ?? ""}</div>
    </div>
  `)
  .join("");

const notesHtml = data.notes?.map((note) => `<li>${note}</li>`).join("") ?? "";

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Product Conversion Intelligence Preview</title>
  <style>
    body { background: #050607; color: #f5f5f7; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; padding: 32px; }
    h1 { text-transform: uppercase; letter-spacing: 0.35em; font-size: 0.85rem; color: #8b93b5; }
    .grid { display: grid; gap: 20px; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
    .card { border: 1px solid rgba(255,255,255,0.08); border-radius: 18px; padding: 20px; background: rgba(255,255,255,0.03); }
    header { display: flex; justify-content: space-between; gap: 12px; }
    .label { font-size: 1rem; font-weight: 600; }
    .subtle { color: #9ea3c6; font-size: 0.85rem; margin-top: 2px; }
    .chips { margin-top: 8px; display: flex; gap: 6px; flex-wrap: wrap; }
    .chip { border-radius: 999px; padding: 3px 10px; font-size: 0.65rem; letter-spacing: 0.15em; text-transform: uppercase; border: 1px solid rgba(255,255,255,0.2); }
    .chip.confidence { border-color: #60a5fa; color: #60a5fa; }
    .chip.alert { border-color: #f87171; color: #f87171; }
    .classification { font-size: 0.8rem; text-transform: uppercase; color: #fcd34d; letter-spacing: 0.2em; }
    .summary { color: #c5cae9; font-size: 0.9rem; margin: 12px 0 6px; }
    .action { color: #fef08a; font-size: 0.9rem; margin-bottom: 12px; }
    .ranges { display: flex; flex-direction: column; gap: 8px; }
    .range-block { border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 10px; background: rgba(255,255,255,0.02); }
    .range-label { text-transform: uppercase; letter-spacing: 0.2em; font-size: 0.7rem; color: #94a3b8; }
    .range-metric { font-size: 0.85rem; margin-top: 4px; }
    .range-note { font-size: 0.75rem; color: #94a3b8; }
    .checklist { margin-top: 32px; }
    .check-item { border-left: 3px solid rgba(255,255,255,0.2); padding: 8px 12px; margin-bottom: 8px; background: rgba(255,255,255,0.02); border-radius: 6px; }
    .check-item.ready { border-color: #34d399; }
    .check-item.todo { border-color: #fbbf24; }
    .check-item.blocked { border-color: #f87171; }
    .detail { font-size: 0.8rem; color: #a5b4fc; margin-top: 3px; }
    ul { font-size: 0.85rem; color: #94a3b8; }
  </style>
</head>
<body>
  <h1>Product Conversion Intelligence (Prototype)</h1>
  <p>Generated ${new Date(data.generatedAt).toLocaleString()}</p>
  <div class="grid">
    ${rowsHtml}
  </div>
  <section class="checklist">
    <h2>Instrumentation Checklist</h2>
    ${checklistHtml}
  </section>
  <section>
    <h2>Prototype notes</h2>
    <ul>${notesHtml}</ul>
  </section>
</body>
</html>`;

const outPath = path.resolve(process.cwd(), "artifacts", "product-conversion-preview.html");
writeFileSync(outPath, html, "utf8");
console.log(outPath);

function formatCurrency(value?: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function formatNumber(value?: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatPercent(value?: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 }).format(value);
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatClassification(value: string) {
  const map: Record<string, string> = {
    HIGH_TRAFFIC_LOW_SALES: "High traffic · low sales",
    HIGH_CARTS_LOW_SALES: "High carts · low sales",
    HIGH_SALES_LOW_TRAFFIC: "High sales · low traffic",
    HISTORICAL_ANCHOR: "Historical anchor",
    HIGH_AOV_OPPORTUNITY: "High-AOV opportunity",
    CURRENT_MOMENTUM: "Current momentum",
    INSTRUMENTATION_GAP: "Instrumentation gap",
    DATA_LIGHT: "Directional only"
  };
  return map[value] ?? value;
}

console.log(`Preview written to ${outPath}`);
