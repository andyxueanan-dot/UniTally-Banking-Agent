import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';

export default defineConfig({
  root: path.resolve(__dirname, 'mobile'),
  envDir: __dirname,
  plugins: [react()],
  publicDir: false,
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server: { host: '127.0.0.1', port: 8091, strictPort: true, proxy: { '/api/bank': 'http://127.0.0.1:5091' } },
  preview: { host: '127.0.0.1', port: 8091, strictPort: true, proxy: { '/api/bank': 'http://127.0.0.1:5091' } },
  build: { outDir: path.resolve(__dirname, 'dist-mobile'), emptyOutDir: true },
});
