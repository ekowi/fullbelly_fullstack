// Adds an optional `image` File field to content collections, so the PIC can
// EITHER paste an Image URL OR upload a photo. The site prefers the uploaded
// file; if empty, it falls back to `image_url`. No data migration — existing
// URL placeholders keep working. Idempotent — safe to re-run.
//
//   node scripts/add-image-file-field.mjs
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
const PUBLIC_POLICY = "abf8a154-5b1c-4a46-ac9c-7300570f4f17"; // "$t:public_label"
const COLLECTIONS = ["menu_items", "facilities", "gallery"];

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

async function ensureImageField(collection) {
  try {
    await api("GET", `/fields/${collection}/image`);
    console.log(`• ${collection}.image field exists — skip`);
    return;
  } catch (e) {
    if (e.status !== 403 && e.status !== 404) throw e;
  }
  await api("POST", `/fields/${collection}`, {
    field: "image",
    type: "uuid",
    meta: {
      interface: "file-image",
      special: ["file"],
      display: "image",
      width: "full",
      note: "Upload foto di sini (opsional). Kalau kosong, situs pakai 'Image URL'. Kalau diisi, upload yang dipakai.",
    },
    schema: {},
  });
  console.log(`✔ ${collection}.image (File) created`);

  // Ensure relation to directus_files (Directus usually auto-creates it)
  try {
    await api("GET", `/relations/${collection}/image`);
  } catch (e) {
    if (e.status === 403 || e.status === 404) {
      await api("POST", "/relations", {
        collection,
        field: "image",
        related_collection: "directus_files",
      });
      console.log(`✔ ${collection}.image relation → directus_files`);
    } else throw e;
  }
}

async function ensurePublicReadFiles() {
  const existing = await api(
    "GET",
    `/permissions?filter[policy][_eq]=${PUBLIC_POLICY}&filter[collection][_eq]=directus_files&filter[action][_eq]=read&fields=id&limit=1`
  );
  if (existing.length) {
    console.log("• public read on directus_files exists — skip");
    return;
  }
  await api("POST", "/permissions", {
    policy: PUBLIC_POLICY,
    collection: "directus_files",
    action: "read",
    fields: ["*"],
    permissions: {},
    validation: {},
  });
  console.log("✔ granted PUBLIC read on directus_files (asset bisa dibaca browser)");
}

async function main() {
  if (!TOKEN) throw new Error("DIRECTUS_TOKEN kosong di .env");
  for (const c of COLLECTIONS) await ensureImageField(c);
  await ensurePublicReadFiles();
  console.log(
    "\n✅ Selesai. Tiap item kini punya:\n" +
      "   • Image URL (string)  — paste URL, atau\n" +
      "   • Image (File)        — upload foto\n" +
      "   Situs prefer File; kalau kosong, pakai URL."
  );
}

main().catch((e) => {
  console.error("\n✖ " + e.message);
  process.exit(1);
});
