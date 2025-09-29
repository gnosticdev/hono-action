/// <reference types="vitest" />
import { getViteConfig } from 'astro/config'
import path from 'node:path'

export default getViteConfig({
    test: {
        projects: [
            {
                extends: true,
                test: {
                    name: { label: 'hono-actions-integration', color: 'cyan' },
                    include: ['package/**/*.test.ts'],
                },
                resolve: {
                    alias: {
                        '@gnosticdev/hono-actions': path.resolve(
                            import.meta.url,
                            'package/src/actions.ts',
                        ),
                    },
                },
            },
        ],
    },
})
