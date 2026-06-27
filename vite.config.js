import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export default defineConfig({
  plugins: [
    basicSsl(),
    react()
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
        admin_routes: resolve(__dirname, 'admin/routes/index.html'),
        admin_bus_data_control: resolve(__dirname, 'admin/bus-data-control/index.html')
      }
    }
  }
});
