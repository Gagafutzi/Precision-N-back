import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  /*
   * The app is published at gagafutzi.github.io/Precision-N-back/, not at the
   * domain root. Without this, Vite emits absolute asset paths like
   * /assets/index-abc.js, which on a project Pages site resolve to the wrong
   * place entirely and the page loads to nothing.
   */
  base: '/Precision-N-back/',
  server: {
    host: '0.0.0.0',
    allowedHosts: ['precision-n-back-production.up.railway.app'],
  },
  plugins: [react()],
  /*
   * The AI Studio template injected process.env.API_KEY / GEMINI_API_KEY here.
   * Nothing in this app ever read either — `grep` finds no use outside the
   * config itself — and `define` inlines the value into the shipped bundle as
   * plain text, where anyone who opens the site can read it. Dead code that
   * leaks a key if anyone ever sets one, so it is gone rather than carried into
   * a public build.
   */
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
});
