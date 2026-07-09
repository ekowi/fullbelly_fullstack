// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  // `host: true` exposes the dev server on the local network (LAN) so a phone
  // on the same Wi-Fi can open it at http://<your-LAN-IP>:4321. Remove to bind
  // to localhost only.
  server: {
    host: true,
    port: 4321,
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
