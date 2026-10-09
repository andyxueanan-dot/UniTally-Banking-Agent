import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';

// V2 interface preview on its own port. The bank backend only trusts origins on 5091/8091,
// so the dev proxy rewrites Host/Origin to the backend's own loopback origin.
const proxy = {
  '/api/bank': { target: 'http://127.0.0.1:5091', changeOrigin: true, headers: { origin: 'http://127.0.0.1:5091' } },
};

export default defineConfig({
  root: path.resolve(__dirname, 'mobile-v2'),
  envDir: __dirname,
  plugins: [react()],
  publicDir: path.resolve(__dirname, 'mobile/public'), // Orbit icon set + web manifest
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server: { host: '127.0.0.1', port: 8092, strictPort: true, proxy },
  preview: { host: '127.0.0.1', port: 8092, strictPort: true, proxy },
  build: { outDir: path.resolve(__dirname, 'dist-mobile-v2'), emptyOutDir: true },
});
