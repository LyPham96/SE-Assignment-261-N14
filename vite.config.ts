import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
const proxy = {
  '/api/v1': process.env.M3_M4_API_TARGET ?? 'http://127.0.0.1:3000',
  '/api': process.env.API_TARGET ?? 'http://127.0.0.1:3001',
};
export default defineConfig({
  plugins: [react()],
  server: {proxy},
  preview: {proxy},
});
