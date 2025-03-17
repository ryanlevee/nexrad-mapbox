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
        'import.meta.env.VITE_MAPBOX_ACCESS_TOKEN': JSON.stringify(import.meta.env.VITE_MAPBOX_ACCESS_TOKEN)
    }
});
