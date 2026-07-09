// Bootstrap Directus for Fullbelly Bogor: creates collections, fields, a static
// read token, and seeds placeholder content. Idempotent — safe to re-run.
//
//   node scripts/bootstrap-directus.mjs
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
const EMAIL = env.ADMIN_EMAIL;
const PASSWORD = env.ADMIN_PASSWORD;
const STATIC_TOKEN = env.DIRECTUS_TOKEN;

let token;
async function api(method, path, body) {
  const res = await fetch(URL + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = json?.errors?.[0]?.message || text;
    const err = new Error(`${method} ${path} → ${res.status}: ${msg}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json?.data ?? json;
}

const pk = () => ({
  field: "id",
  type: "integer",
  meta: { hidden: true },
  schema: { is_primary_key: true, has_auto_increment: true },
});
const sortField = () => ({
  field: "sort",
  type: "integer",
  meta: { interface: "input", hidden: true },
});
const str = (field, opts = {}) => ({
  field,
  type: "string",
  meta: { interface: "input", note: opts.note, required: !!opts.required, width: opts.width || "full" },
  schema: { is_nullable: opts.required ? false : true },
});
const text = (field, note) => ({
  field,
  type: "text",
  meta: { interface: "input-multiline", note },
});
const int = (field, note) => ({
  field,
  type: "integer",
  meta: { interface: "input", note },
});
const dropdown = (field, choices, note) => ({
  field,
  type: "string",
  meta: {
    interface: "select-dropdown",
    options: { choices: choices.map((c) => ({ text: c[0], value: c[1] })) },
    note,
  },
});

async function ensureCollection(name, meta, fields) {
  try {
    await api("GET", `/collections/${name}`);
    console.log(`• collection "${name}" already exists — skip`);
    return;
  } catch (e) {
    if (e.status !== 403 && e.status !== 404) throw e;
  }
  await api("POST", "/collections", { collection: name, meta, schema: {}, fields });
  console.log(`✔ created collection "${name}"`);
}

async function seed(collection, rows) {
  const existing = await api("GET", `/items/${collection}?aggregate[count]=*`);
  const count = Number(existing?.[0]?.count ?? 0);
  if (count > 0) {
    console.log(`• "${collection}" already has ${count} rows — skip seed`);
    return;
  }
  await api("POST", `/items/${collection}`, rows);
  console.log(`✔ seeded ${rows.length} rows into "${collection}"`);
}

const img = (id, w = 1200) =>
  `https://images.unsplash.com/photo-${id}?w=${w}&q=72&auto=format&fit=crop`;

async function main() {
  // 1) Login
  const auth = await api("POST", "/auth/login", { email: EMAIL, password: PASSWORD });
  token = auth.access_token;
  console.log("✔ logged in as admin");

  // 2) Static read token on admin user (used by Astro build-time fetch)
  const me = await api("GET", "/users/me?fields=id,token");
  if (me.token !== STATIC_TOKEN) {
    await api("PATCH", `/users/${me.id}`, { token: STATIC_TOKEN });
    console.log("✔ set static token on admin user");
  } else {
    console.log("• static token already set — skip");
  }

  // 3) Collections
  await ensureCollection(
    "site_settings",
    { singleton: true, icon: "settings", note: "Nomor WA, alamat, jam buka, dll." },
    [
      pk(),
      str("whatsapp_number", { note: "Nomor WhatsApp, format internasional tanpa +, mis. 6281234567890" }),
      str("instagram_handle"),
      str("address_line1"),
      str("address_line2"),
      str("restaurant_hours"),
      str("arena_hours"),
      text("footer_tagline"),
      { field: "latitude", type: "float", meta: { interface: "input", note: "Titik peta (lat), mis. -6.5966", width: "half" } },
      { field: "longitude", type: "float", meta: { interface: "input", note: "Titik peta (lng), mis. 106.7972", width: "half" } },
    ]
  );

  await ensureCollection(
    "menu_items",
    { icon: "restaurant_menu", sort_field: "sort", note: "Item menu: signature, cafe, drinks." },
    [
      pk(),
      str("name", { required: true }),
      int("price", "Harga dalam Rupiah, angka saja (mis. 850000)"),
      dropdown("category", [["Signature Dishes", "signature"], ["Cafe Specials", "cafe"], ["Drinks", "drinks"]]),
      text("description"),
      str("image_url", { note: "URL gambar (kosongkan untuk drinks)" }),
      sortField(),
    ]
  );

  await ensureCollection(
    "facilities",
    { icon: "sports_tennis", sort_field: "sort", note: "Lapangan/fasilitas olahraga." },
    [
      pk(),
      str("name", { required: true }),
      text("tagline"),
      str("badges", { note: "Pisahkan dengan koma, mis. Indoor,Outdoor" }),
      str("hours", { note: "mis. 06:00 - 23:00" }),
      str("capacity", { note: "mis. Max 15 Pax (boleh kosong)" }),
      str("image_url"),
      sortField(),
    ]
  );

  await ensureCollection(
    "gallery",
    { icon: "photo_library", sort_field: "sort", note: "Foto galeri (Visual Experience)." },
    [
      pk(),
      str("tag", { note: "mis. Restaurant, Sports, Cafe" }),
      str("label", { note: "mis. Main Dining" }),
      str("image_url"),
      dropdown(
        "layout",
        [["Feature (besar)", "feature"], ["Tall (tinggi)", "tall"], ["Wide (lebar)", "wide"], ["Normal", "normal"]],
        "Ukuran tile di grid"
      ),
      sortField(),
    ]
  );

  // 4) Seed
  await api("PATCH", "/items/site_settings", {
    whatsapp_number: "6281234567890",
    instagram_handle: "@fullbellybogor",
    address_line1: "Jl. Pajajaran No. 123, Bogor Tengah",
    address_line2: "Kota Bogor, Jawa Barat 16128",
    restaurant_hours: "10:00 AM – 10:00 PM",
    arena_hours: "06:00 AM – 11:00 PM",
    footer_tagline: "Where courtside energy meets a good meal — right in the heart of Bogor.",
    latitude: -6.5966,
    longitude: 106.7972,
  });
  console.log("✔ seeded site_settings");

  await seed("menu_items", [
    { category: "signature", name: "Tomahawk Prime", price: 850000, sort: 1, image_url: img("1558030089-02acba3c214e", 1000), description: "Dry-aged for 35 days, grilled over charcoal, served with roasted root vegetables and a rich black pepper jus." },
    { category: "signature", name: "Norwegian Salmon", price: 220000, sort: 2, image_url: img("1519708227418-c8fd9a32b7a2", 1000), description: "Pan-seared to perfection, resting on a bed of quinoa salad with a zesty citrus beurre blanc." },
    { category: "cafe", name: "Artisan Avocado Toast", price: 65000, sort: 1, image_url: img("1687276287139-88f7333c8ca4", 300), description: "Sourdough bread, smashed avocado, cherry tomatoes, and a soft poached egg." },
    { category: "cafe", name: "Fullbelly Burger", price: 95000, sort: 2, image_url: img("1549611016-3a70d82b5040", 300), description: "Wagyu beef patty, caramelized onions, smoked cheddar, house-made brioche bun." },
    { category: "cafe", name: "Power Bowl Salad", price: 70000, sort: 3, image_url: img("1512621776951-a57141f2eefd", 300), description: "Mixed greens, roasted chickpeas, feta cheese, pomegranate seeds, lemon dressing." },
    { category: "drinks", name: "Signature Cold Brew", price: 45000, sort: 1, image_url: null, description: "Steeped 24 hours" },
    { category: "drinks", name: "Matcha Latte", price: 50000, sort: 2, image_url: null, description: "Premium Uji Matcha" },
    { category: "drinks", name: "Sunset Mocktail", price: 55000, sort: 3, image_url: null, description: "Orange, Cranberry, Soda" },
    { category: "drinks", name: "Classic Mojito", price: 60000, sort: 4, image_url: null, description: "Fresh mint & lime" },
  ]);

  await seed("facilities", [
    { name: "Padel Court", sort: 1, tagline: "Professional grade standard", badges: "Indoor,Outdoor", hours: "06:00 - 23:00", capacity: "Max 15 Pax", image_url: img("1658491830143-72808ca237e3") },
    { name: "Basketball Court", sort: 2, tagline: "Professional grade hardwood flooring with FIBA standard rings.", badges: "Hardwood", hours: "08:00 - 22:00", capacity: null, image_url: img("1646625753091-de94be5cfc32", 900) },
  ]);

  await seed("gallery", [
    { tag: "Restaurant", label: "Main Dining", layout: "feature", sort: 1, image_url: img("1463797221720-6b07e6426c24") },
    { tag: "Signature", label: "Premium Steak", layout: "normal", sort: 2, image_url: img("1558030089-02acba3c214e", 700) },
    { tag: "Sports", label: "The Arena", layout: "tall", sort: 3, image_url: img("1585070105361-a13b5623791c", 800) },
    { tag: "Cafe", label: "Signature Brew", layout: "normal", sort: 4, image_url: img("1497636577773-f1231844b336", 700) },
    { tag: "Cafe", label: "Lounge & Coffee", layout: "wide", sort: 5, image_url: img("1521017432531-fbd92d768814") },
    { tag: "Dining", label: "Private Room", layout: "wide", sort: 6, image_url: img("1752758059740-fd250168138e") },
  ]);

  console.log("\n✅ Bootstrap complete. Admin: " + URL + "/admin");
}

main().catch((e) => {
  console.error("\n✖ " + e.message);
  if (e.body) console.error(JSON.stringify(e.body, null, 2));
  process.exit(1);
});
