# Fullbelly Bogor — Website & CMS

## TLDR
Website + CMS untuk Fullbelly Bogor (venue olahraga + resto/cafe). **Frontend UI ✅ + CMS Directus ✅ (lokal)** — halaman Home, Menu, Sports, Gallery; Menu/Sports/Gallery/header/footer sudah ambil data dari Directus, PIC bisa edit konten (role non-admin). Map "Get in Touch" pakai peta gelap interaktif (Leaflet). **Yang tersisa: Fase C (deploy)** + isi konten asli (via CMS) + opsional upgrade gambar ke file-upload. Stack target: **Astro (static) + Directus + PostgreSQL + Caddy + Cloudflare** di VPS **2 vCPU / 4GB RAM**. Keputusan kunci: Astro **static build**, hemat RAM (bukan SSR).

## Status
- **Desain**: selesai (wireframe + high-fidelity mockup, brand dark theme).
- **Frontend UI**: ✅ **selesai** — Astro + Tailwind v4, font display Sora, aksen oranye. Halaman **Home, Menu, Sports, Gallery**. Responsif (diverifikasi s/d 320px), mobile nav hamburger + drawer, micro-interactions. Dev server bisa diakses LAN (`server.host` di config) untuk tes HP.
- **CMS (Directus)**: ✅ **terintegrasi (lokal)** — Postgres + Directus via Docker Compose. Collections `menu_items`, `facilities`, `gallery`, `site_settings` dibuat + ter-seed. **Menu, Sports, Gallery, header, footer ambil data dari CMS**. **Role PIC** (Content Editor, non-admin) sudah dibuat — hanya edit konten, tak bisa ubah struktur. Alur edit terbukti.
- **Map**: ✅ "Get in Touch" pakai **peta gelap interaktif** (Leaflet + CartoDB dark), pin dari `site_settings.latitude/longitude` (CMS-driven).
- **Analytics**: ✅ **siap pakai, mati by default**. Slot GTM / GA4 / Meta Pixel / Plausible / Umami di `Analytics.astro`. Aktifkan dengan isi ID di **CMS Site Settings** (PIC bisa) atau `.env` — kosong = tidak load apa pun.
- **Booking**: halaman **dihapus** dari nav. CTA "Book Now" / "Book Court" → **WhatsApp** (nomor dari `site_settings.whatsapp_number`, masih placeholder `6281234567890`).
- **Masih hardcoded**: halaman **Home** (hero + kartu "Three Experiences" + pillars — konten marketing, jarang berubah). Gambar disimpan sebagai **URL string** (placeholder Unsplash), belum upload file Directus.
- **Belum (Fase C)**: deploy ke VPS/hosting. Opsional: upgrade gambar ke file-upload, koordinat pin asli, Home ke CMS.

## Ringkasan Proyek
Fullbelly Bogor adalah venue olahraga (padel, basketball) sekaligus resto/cafe. Website berfungsi sebagai:
- Brosur digital 24/7 (Home, Menu, Sports, Gallery)
- Entry point booking/kontak lewat WhatsApp
- CMS mandiri: PIC non-programmer bisa update harga menu, foto, dan status lapangan tanpa bantuan developer

## Constraint
- Target deploy: VPS 2 vCPU / 4GB RAM (anggaran resource ketat)
- Prioritas: hemat resource, low-maintenance, PIC non-teknis bisa self-service edit konten

## Menjalankan Lokal
```
astro dev --background      # start (background mode)
astro dev status | logs | stop
```
Akses: `http://localhost:4321` (laptop) atau `http://192.168.46.235:4321` (HP di Wi-Fi sama). Config `server.host: true` sudah aktif di `astro.config.mjs` untuk tes LAN.

## Tech Stack

| Layer | Pilihan | Peran | Status |
|---|---|---|---|
| Frontend | Astro (static) + Tailwind v4 | Render Home/Menu/Sports/Gallery | ✅ dibangun (data hardcoded) |
| Data (CMS) | Astro build-time fetch (`@directus/sdk`) | Menu/Sports/Gallery/settings dari Directus | ✅ tersambung |
| Data panas | Astro island (client-side fetch) | Status lapangan real-time (upgrade dari build-time) | ⬜ nanti |
| CMS | Directus 11 | Dashboard PIC + REST API | ✅ jalan (lokal, Docker) |
| Database | PostgreSQL 16 | Storage Directus | ✅ jalan (lokal, Docker) |
| Reverse proxy | Caddy | Routing + TLS | ⬜ belum (Fase C) |
| Edge | Cloudflare | Cache aset statis, proteksi DDoS | ⬜ belum (Fase C) |

Estimasi RAM idle: Postgres ~150–300MB, Directus ~300–600MB, Caddy ~30MB, OS ~300–500MB → total ±1–1.5GB dari 4GB.

## Keputusan Arsitektur Kunci
1. **Astro static, bukan SSR** — SSR butuh proses Node 24/7, bikin RAM mepet di VPS 4GB.
2. **Cache Cloudflare bypass/pendek untuk `/api/*`** — aset statis di-cache lama, data panas tetap fresh.
3. **Docker Compose dengan `mem_limit` per service** — cegah satu container menghabiskan RAM.
4. **Swapfile 2GB di VPS** — jaring pengaman OOM.
5. **Booking via WhatsApp, bukan sistem reservasi** — tidak ada halaman/collection booking; CTA langsung ke WhatsApp.

## Content Model (Directus Collections — ✅ live)
- `menu_items` — name, price (integer Rupiah), category (signature/cafe/drinks), description, image_url, sort → **menu.astro**
- `facilities` — name, tagline, badges (CSV), hours, capacity, image_url, sort → **sports.astro**
- `gallery` — tag, label, image_url, layout (feature/tall/wide/normal), sort → **gallery.astro**
- `site_settings` (singleton) — whatsapp_number, instagram_handle, address_line1/2, restaurant_hours, arena_hours, footer_tagline → **header/footer/pages**

**Gambar bisa dua cara** (per item): field **Image URL** (paste URL) **atau** field **Image** (upload file). Situs prefer file upload; kalau kosong, pakai URL. Placeholder sekarang masih pakai URL; PIC tinggal upload foto asli ke field Image saat sudah ada.

## Menjalankan CMS (lokal)
```
docker compose up -d            # start Postgres + Directus
node scripts/bootstrap-directus.mjs   # (sekali) buat collections + seed — idempotent
docker compose logs -f directus | docker compose down
```
- **Admin (developer, akses penuh)**: http://localhost:8055/admin — `admin@fullbelly.com` / `admin12345`.
- **PIC (content editor, non-admin)**: `pic@fullbelly.com` / `pic12345` — buat via `node scripts/create-pic-user.mjs`. PIC **hanya** lihat modul Content (4 collection) + Files; **tidak ada Settings/Data Model**, jadi tak bisa ubah tipe field / struktur (terbukti: edit nilai → 200, tambah field → 403). Ganti password sebelum dipakai asli.
- **Site baca CMS** via static token di `.env` (`DIRECTUS_TOKEN`), build-time (server-side, tak bocor ke browser).
- **Dev**: edit di Directus → reload halaman → langsung berubah (SSR per request). **Produksi static**: perlu rebuild (webhook — Fase C4).

## Timeline / Action Plan

### Fase A — Frontend UI (statis)
- ✅ A0 Keputusan arsitektur & stack
- ✅ A1 Scaffold Astro + Tailwind v4; layout, header (nav + mobile drawer), footer shared
- ✅ A2 Halaman Home, Menu, Sports, Gallery (dark theme, responsif s/d 320px, foto placeholder)
- ✅ A3 Booking dihapus → CTA WhatsApp
- ⬜ **A4 Konten asli** — ganti foto Unsplash dengan foto Fullbelly, harga menu asli, nomor WA asli, alamat/jam asli

### Fase B — CMS & Data ✅ (lokal)
- ✅ B1 Postgres + Directus via Docker Compose (`mem_limit` per service)
- ✅ B2 Collections (`menu_items`, `facilities`, `gallery`, `site_settings`) + seed placeholder (`scripts/bootstrap-directus.mjs`)
- ✅ B3 Astro build-time fetch dari Directus (menu, sports, gallery, header, footer) — data hardcoded diganti
- ✅ B4 Role/policy PIC terbatas (Content Editor, non-admin) — `scripts/create-pic-user.mjs`
- ✅ B5 Map gelap interaktif (Leaflet + CartoDB), pin CMS-driven (`site_settings.lat/lng`) — `MapCard.astro`
- ✅ B6 Gambar dual: field **Image URL** (paste) **atau** **Image** (upload file) — situs prefer file, fallback URL (`scripts/add-image-file-field.mjs`, helper `imageFor()`)
- ✅ B7 Slot analytics siap-pakai (GTM/GA4/Meta Pixel/Plausible/Umami), mati default, on/off dari CMS atau `.env` (`Analytics.astro`, `scripts/add-analytics-fields.mjs`)
- ⬜ B8 (opsional) Island client-side untuk data panas (status lapangan real-time)
- ⬜ B9 (opsional, saat pakai GTM/GA/Meta) Cookie-consent banner (UU PDP)

### Fase C — Deploy & Ops
- ⬜ C1 Provisioning VPS (Ubuntu LTS, hardening SSH/UFW/fail2ban, Docker + Compose, swapfile)
- ⬜ C2 Caddy reverse proxy + TLS (domain → static Astro, `/cms` & `/api` → Directus)
- ⬜ C3 Cloudflare (proxy aktif, cache rules: lama untuk aset, pendek/bypass untuk `/api/*`)
- ⬜ C4 Deploy pipeline — build & sync Astro + webhook Directus untuk trigger rebuild saat konten berubah
- ⬜ C5 Backup (`pg_dump` harian + uploads Directus) + uptime monitoring
- ⬜ C6 Security pass — rate limit API, admin Directus di-proteksi (Cloudflare Access / IP allowlist)

## Langkah Berikutnya (rekomendasi)
UI ✅ dan CMS ✅ (lokal). Untuk MVP tayang, jalur berikutnya:

1. **Deploy (Fase C)** — bawa stack (Astro static + Directus + Postgres + Caddy) ke VPS, atau MVP lebih cepat: deploy **Astro static gratis (Cloudflare Pages/Netlify)** + Directus di VPS/managed. Setelah live, PIC bisa isi konten asli langsung lewat admin Directus (menggantikan A4 manual).
2. **B4 role PIC** sebelum go-live — bikin akun/role Directus terbatas (hanya edit konten, bukan admin penuh).
3. **B5 foto asli** — begitu foto Fullbelly tersedia, upgrade `image_url` → upload file Directus (atau PIC paste URL untuk sementara).

**Rekomendasi:** lanjut **Fase C (deploy)** supaya bisa segera tayang + PIC mulai isi konten asli via CMS. B4 (role) dikerjakan bareng sebelum akun PIC dibuka.

## Open Questions
- Hosting: seluruh stack di 1 VPS 2c/4GB, atau split (Astro static di Cloudflare Pages/Netlify gratis + Directus+Postgres di VPS)?
- Domain & akun Cloudflare sudah disiapkan?
- Deploy pipeline: manual `git pull` vs GitHub Actions? Webhook rebuild dari Directus?
- Foto asli & nomor WhatsApp asli — kapan tersedia (bisa diisi PIC via CMS setelah live)?

## Referensi
Struktur kode: halaman di `src/pages/` (`index`, `menu`, `sports`, `gallery`), komponen shared di `src/components/` (`Header`, `Footer`, `ImagePlaceholder`), layout di `src/layouts/Layout.astro`, tokens desain di `src/styles/global.css`.
