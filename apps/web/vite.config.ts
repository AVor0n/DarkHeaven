import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// На GitHub Pages сайт живёт в подпапке /DarkHeaven/.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/DarkHeaven/' : '/',
  plugins: [react()],
}));
