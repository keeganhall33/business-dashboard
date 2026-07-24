import crypto from "node:crypto";

function normalize(value = "") {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function buildOpportunityNaturalKey(name = "", organization = "") {
  const normalizedName = normalize(name);
  const normalizedOrg = normalize(organization);
  const plaintext = `${normalizedName}|${normalizedOrg}`;
  return crypto.createHash("sha256").update(plaintext).digest("hex");
}

export const __test__ = { normalize };
