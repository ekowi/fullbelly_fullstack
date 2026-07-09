import {
  createDirectus,
  rest,
  staticToken,
  readItems,
  readSingleton,
} from "@directus/sdk";

// Build-time (server-side) config. These are read from .env; never exposed to the browser.
const DIRECTUS_URL =
  import.meta.env.DIRECTUS_URL || process.env.DIRECTUS_URL || "http://localhost:8055";
const DIRECTUS_TOKEN =
  import.meta.env.DIRECTUS_TOKEN || process.env.DIRECTUS_TOKEN || "";
// Browser-facing Directus URL (for <img src> asset links). In prod set this to
// the public Directus domain; locally it defaults to DIRECTUS_URL.
const PUBLIC_DIRECTUS_URL =
  import.meta.env.PUBLIC_DIRECTUS_URL || process.env.PUBLIC_DIRECTUS_URL || DIRECTUS_URL;

export interface MenuItem {
  id: number;
  name: string;
  price: number;
  category: "signature" | "cafe" | "drinks";
  description: string;
  image_url: string | null;
  image: string | null; // Directus file uuid (optional upload; wins over image_url)
  sort: number | null;
}
export interface Facility {
  id: number;
  name: string;
  tagline: string;
  badges: string; // comma-separated
  hours: string;
  capacity: string | null;
  image_url: string | null;
  image: string | null;
  sort: number | null;
}
export interface GalleryItem {
  id: number;
  tag: string;
  label: string;
  image_url: string | null;
  image: string | null;
  layout: "feature" | "tall" | "wide" | "normal";
  sort: number | null;
}
export interface SiteSettings {
  whatsapp_number: string;
  instagram_handle: string;
  address_line1: string;
  address_line2: string;
  restaurant_hours: string;
  arena_hours: string;
  footer_tagline: string;
  latitude: number | null;
  longitude: number | null;
  // Analytics (CMS-editable; empty = off). See Analytics.astro.
  gtm_id: string | null;
  ga4_id: string | null;
  meta_pixel_id: string | null;
  plausible_domain: string | null;
  umami_src: string | null;
  umami_website_id: string | null;
}

interface Schema {
  menu_items: MenuItem[];
  facilities: Facility[];
  gallery: GalleryItem[];
  site_settings: SiteSettings;
}

const client = createDirectus<Schema>(DIRECTUS_URL)
  .with(staticToken(DIRECTUS_TOKEN))
  .with(rest());

// Defensive wrapper: if the CMS is unreachable at build time, log and fall back
// so the dev server / build doesn't hard-crash.
async function safe<T>(fn: () => Promise<T>, fallback: T, label: string): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.warn(`[directus] failed to fetch ${label}:`, (err as Error).message);
    return fallback;
  }
}

export const DEFAULT_SETTINGS: SiteSettings = {
  whatsapp_number: "6281234567890",
  instagram_handle: "@fullbellybogor",
  address_line1: "Jl. Pajajaran No. 123, Bogor Tengah",
  address_line2: "Kota Bogor, Jawa Barat 16128",
  restaurant_hours: "10:00 AM – 10:00 PM",
  arena_hours: "06:00 AM – 11:00 PM",
  footer_tagline: "Where courtside energy meets a good meal — right in the heart of Bogor.",
  latitude: -6.5966,
  longitude: 106.7972,
  gtm_id: null,
  ga4_id: null,
  meta_pixel_id: null,
  plausible_domain: null,
  umami_src: null,
  umami_website_id: null,
};

export const getMenu = () =>
  safe(() => client.request(readItems("menu_items", { sort: ["sort"], limit: -1 })), [], "menu_items");

export const getFacilities = () =>
  safe(() => client.request(readItems("facilities", { sort: ["sort"], limit: -1 })), [], "facilities");

export const getGallery = () =>
  safe(() => client.request(readItems("gallery", { sort: ["sort"], limit: -1 })), [], "gallery");

export const getSettings = () =>
  safe(() => client.request(readSingleton("site_settings")), DEFAULT_SETTINGS, "site_settings");

// Helpers
export const formatRupiah = (n: number) => "Rp " + n.toLocaleString("id-ID");

export const waUrl = (number: string, text: string) =>
  `https://wa.me/${number}?text=${encodeURIComponent(text)}`;

// URL to a Directus-hosted file (uploaded image).
export const assetUrl = (id: string) => `${PUBLIC_DIRECTUS_URL}/assets/${id}`;

// Resolve the image to show: prefer the uploaded File, fall back to the URL string.
export const imageFor = (item: { image?: string | null; image_url?: string | null }) =>
  item.image ? assetUrl(item.image) : (item.image_url ?? undefined);
