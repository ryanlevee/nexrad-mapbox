import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';

export default defineConfig({
    plugins: [solidPlugin()],
    server: {
        port: 3000,
    },
    build: {
        target: 'esnext',
    },
    define: {
        'PRODUCTION': true,
        '__MAP_TOKEN__': JSON.stringify(process.env.VITE_MAPBOX_ACCESS_TOKEN)
      }
  });
