import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

import { resolve } from 'path';

export default defineConfig({
  plugins: [
    basicSsl()
  ],
  server: {
    host: true, // Listen on all local IPs
    https: true // Enable HTTPS
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin/index.html'),
        admin_manage_buses: resolve(__dirname, 'admin/manage-buses/index.html'),
        admin_approvals: resolve(__dirname, 'admin/approvals/index.html'),
        admin_places: resolve(__dirname, 'admin/places/index.html'),
        admin_routes: resolve(__dirname, 'admin/routes/index.html')
      }
    }
  }
});
