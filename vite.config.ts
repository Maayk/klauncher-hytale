import { defineConfig } from 'vite';
import path from 'node:path';
import electron from 'vite-plugin-electron/simple';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
    base: './',
    plugins: [
        react(),
        tailwindcss(),
        electron({
            main: {
                entry: 'src/main/index.ts',
                vite: {
                    build: {
                        outDir: 'dist/main',
                    },
                },
            },
            preload: {
                input: 'src/preload/index.ts',
                vite: {
                    build: {
                        outDir: 'dist/preload',
                    },
                },
            },
            renderer: {},
        }),
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src'),
        },
    },
    server: {
        port: 5173,
        strictPort: true,
    }
});
