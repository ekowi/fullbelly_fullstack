// Creates a non-admin "Content Editor" policy + role + PIC user in Directus.
// The PIC can edit content VALUES (title, description, price, photo, hours, ...)
// on the content collections, but CANNOT touch the Data Model (field types,
// add/remove fields, create collections) — that requires admin_access, which
// this policy does NOT grant. Idempotent — safe to re-run.
//
//   node scripts/create-pic-user.mjs
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
const ADMIN_EMAIL = env.ADMIN_EMAIL;
const ADMIN_PASSWORD = env.ADMIN_PASSWORD;
const PIC_EMAIL = env.PIC_EMAIL || "pic@fullbelly.com";
const PIC_PASSWORD = env.PIC_PASSWORD || "pic12345";

// Collections the PIC may manage, and which actions.
const CONTENT = {
  menu_items: ["create", "read", "update", "delete"],
  facilities: ["create", "read", "update", "delete"],
  gallery: ["create", "read", "update", "delete"],
  site_settings: ["read", "update"], // singleton
};

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
  const t = await res.text();
  const j = t ? JSON.parse(t) : null;
  if (!res.ok) {
    const err = new Error(`${method} ${path} → ${res.status}: ${j?.errors?.[0]?.message || t}`);
    err.status = res.status;
    err.body = j;
    throw err;
  }
  return j?.data ?? j;
}

async function main() {
  token = (await api("POST", "/auth/login", { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }))
    .access_token;
  console.log("✔ logged in as admin");

  // 1) Policy (non-admin, app access so PIC can use the Studio UI)
  const policies = await api("GET", "/policies?fields=id,name&limit=-1");
  let policy = policies.find((p) => p.name === "Content Editor");
  if (!policy) {
    policy = await api("POST", "/policies", {
      name: "Content Editor",
      icon: "edit",
      description: "Hanya edit konten (judul, teks, harga, foto). Tidak bisa ubah struktur/tipe field.",
      admin_access: false,
      app_access: true,
    });
    console.log("✔ created policy 'Content Editor'");
  } else {
    console.log("• policy 'Content Editor' exists — skip");
  }

  // 2) Permissions on content collections (skip if this policy already has some)
  const existingPerms = await api(
    "GET",
    `/permissions?filter[policy][_eq]=${policy.id}&fields=id&limit=1`
  );
  if (!existingPerms.length) {
    for (const [collection, actions] of Object.entries(CONTENT)) {
      for (const action of actions) {
        await api("POST", "/permissions", {
          policy: policy.id,
          collection,
          action,
          fields: ["*"], // all VALUE fields — not schema
          permissions: {},
          validation: {},
        });
      }
    }
    // Let the PIC see/upload images in the file library (for "ganti foto")
    for (const action of ["create", "read", "update"]) {
      await api("POST", "/permissions", {
        policy: policy.id,
        collection: "directus_files",
        action,
        fields: ["*"],
        permissions: {},
        validation: {},
      });
    }
    console.log("✔ added content permissions to policy");
  } else {
    console.log("• policy already has permissions — skip");
  }

  // 3) Role
  const roles = await api("GET", "/roles?fields=id,name&limit=-1");
  let role = roles.find((r) => r.name === "PIC (Content Editor)");
  if (!role) {
    role = await api("POST", "/roles", { name: "PIC (Content Editor)", icon: "manage_accounts" });
    console.log("✔ created role 'PIC (Content Editor)'");
  } else {
    console.log("• role exists — skip");
  }

  // 4) Attach policy to role (directus_access junction)
  const access = await api(
    "GET",
    `/access?filter[role][_eq]=${role.id}&filter[policy][_eq]=${policy.id}&fields=id&limit=1`
  );
  if (!access.length) {
    await api("POST", "/access", { role: role.id, policy: policy.id });
    console.log("✔ linked policy → role");
  } else {
    console.log("• policy already linked to role — skip");
  }

  // 5) PIC user
  const users = await api("GET", `/users?filter[email][_eq]=${PIC_EMAIL}&fields=id&limit=1`);
  if (!users.length) {
    await api("POST", "/users", {
      email: PIC_EMAIL,
      password: PIC_PASSWORD,
      first_name: "PIC",
      last_name: "Fullbelly",
      role: role.id,
    });
    console.log(`✔ created PIC user ${PIC_EMAIL}`);
  } else {
    await api("PATCH", `/users/${users[0].id}`, { role: role.id, password: PIC_PASSWORD });
    console.log(`• PIC user existed — ensured role + password`);
  }

  console.log(`\n✅ Done. PIC login: ${URL}/admin  →  ${PIC_EMAIL} / ${PIC_PASSWORD}`);
  console.log("   PIC hanya lihat modul Content (4 collection) + Files. Tidak ada Settings/Data Model.");
}

main().catch((e) => {
  console.error("\n✖ " + e.message);
  if (e.body) console.error(JSON.stringify(e.body, null, 2));
  process.exit(1);
});
