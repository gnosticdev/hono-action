import cloudflare from '@astrojs/cloudflare'
import tailwindcss from '@tailwindcss/vite'
import { createResolver } from 'astro-integration-kit'
import { hmrIntegration } from 'astro-integration-kit/dev'
import { defineConfig } from 'astro/config'

const { default: honoActions } = await import('@gnosticdev/hono-actions')

// https://astro.build/config
export default defineConfig({
    integrations: [
        honoActions(),
        hmrIntegration({
            directory: createResolver(import.meta.url).resolve(
                '../package/dist',
            ),
        }),
    ],
    adapter: cloudflare(),
    vite: {
        plugins: [tailwindcss()],
    },
})
