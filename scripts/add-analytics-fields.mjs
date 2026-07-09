// Adds analytics/tracking ID fields to site_settings so the PIC/admin can turn
// analytics on/off from the CMS (no code/.env change). All empty by default =
// analytics OFF. Idempotent — safe to re-run.
//
//   node scripts/add-analytics-fields.mjs
//
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(join(root, ".env"), "utf8")
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const URL = env.DIRECTUS_URL || "http://localhost:8055";
const TOKEN = env.DIRECTUS_TOKEN;

async function api(method, path, body) {
  const res = await fetch(URL + path, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await res.text();
  const j = t ? JSON.parse(t) : null;
  if (!res.ok) {
    const e = new Error(`${method} ${path} → ${res.status}: ${j?.errors?.[0]?.message || t}`);
    e.status = res.status;
    throw e;
  }
  return j?.data ?? j;
}

const FIELDS = [
  ["analytics_divider", "alias", {
    interface: "presentation-divider",
    special: ["alias", "no-data"],
    options: { title: "Analytics / Tracking", icon: "insights" },
    note: "Kosongkan semua = analytics MATI. GTM/GA4/Meta butuh cookie-consent.",
    width: "full",
  }],
  ["gtm_id", "string", { note: "Google Tag Manager, mis. GTM-XXXXXXX" }],
  ["ga4_id", "string", { note: "Google Analytics 4, mis. G-XXXXXXXXXX" }],
  ["meta_pixel_id", "string", { note: "Meta/Facebook Pixel ID (angka)" }],
  ["plausible_domain", "string", { note: "Plausible: domain situs, mis. fullbelly.com (cookieless)" }],
  ["umami_src", "string", { note: "Umami: URL script, mis. https://umami.domain.com/script.js" }],
  ["umami_website_id", "string", { note: "Umami: Website ID (UUID)" }],
];

async function ensureField(field, type, meta) {
  try {
    await api("GET", `/fields/site_settings/${field}`);
    console.log(`• site_settings.${field} exists — skip`);
    return;
  } catch (e) {
    if (e.status !== 403 && e.status !== 404) throw e;
  }
  await api("POST", "/fields/site_settings", {
    field,
    type,
    meta: { interface: type === "alias" ? undefined : "input", width: "half", ...meta },
    schema: type === "alias" ? null : {},
  });
  console.log(`✔ added site_settings.${field}`);
}

async function main() {
  if (!TOKEN) throw new Error("DIRECTUS_TOKEN kosong di .env");
  for (const [field, type, meta] of FIELDS) await ensureField(field, type, meta);
  console.log("\n✅ Field analytics siap di Site Settings. Isi ID untuk mengaktifkan (kosong = mati).");
}

main().catch((e) => {
  console.error("\n✖ " + e.message);
  process.exit(1);
});
