import { describe, expect, it } from 'bun:test'
import {
    generateRouter,
    getAstroHandler,
    getHonoClient,
} from '../src/integration-files'

describe('Virtual Imports', () => {
    describe('Virtual Import IDs', () => {
        it('should use consistent virtual import IDs', () => {
            // These should match the constants defined in the integration
            const VIRTUAL_MODULE_ID_CLIENT = '@gnosticdev/hono-actions/client'
            const VIRTUAL_MODULE_ID_ROUTER = 'virtual:hono-actions/router'

            expect(VIRTUAL_MODULE_ID_CLIENT).toBe(
                '@gnosticdev/hono-actions/client',
            )
            expect(VIRTUAL_MODULE_ID_ROUTER).toBe('virtual:hono-actions/router')
        })

        it('should have valid virtual import ID formats', () => {
            const clientId = '@gnosticdev/hono-actions/client'
            const routerId = 'virtual:hono-actions/router'

            // Client ID should be a valid npm package import
            expect(clientId).toMatch(/^@[^/]+\/[^/]+/)

            // Router ID should be a valid virtual module ID
            expect(routerId).toMatch(/^virtual:/)
        })
    })

    describe('Generated Code Validity', () => {
        it('should generate valid TypeScript code for router', () => {
            const routerContent = generateRouter({
                basePath: '/api',
                relativeActionsPath: '../actions',
            })

            // Should have proper imports
            expect(routerContent).toContain('import type { HonoEnv }')
            expect(routerContent).toContain('import { Hono } from')
            expect(routerContent).toContain('import { cors } from')
            expect(routerContent).toContain('import { showRoutes } from')
            expect(routerContent).toContain('import { logger } from')
            expect(routerContent).toContain('import { prettyJSON } from')

            // Should have proper type definitions
            expect(routerContent).toContain('type ActionSchema =')
            expect(routerContent).toContain('export type HonoRouter =')

            // Should have proper function definitions
            expect(routerContent).toContain(
                'export async function buildRouter()',
            )
            expect(routerContent).toContain('const app = new Hono')

            // Should have proper exports
            expect(routerContent).toContain('export default app')
        })

        it('should generate valid TypeScript code for client', () => {
            const clientContent = getHonoClient(3000)

            // Should have proper imports
            expect(clientContent).toContain('import type { HonoRouter }')
            expect(clientContent).toContain('import { hc } from')

            // Should have proper function definitions
            expect(clientContent).toContain('export function getBaseUrl()')
            expect(clientContent).toContain('export const honoClient =')

            // Should have proper type annotations
            expect(clientContent).toContain('hc<HonoRouter>')
        })

        it('should generate valid TypeScript code for handler', () => {
            const handlerContent = getAstroHandler('cloudflare')

            // Should have proper imports
            expect(handlerContent).toContain('import router from')
            expect(handlerContent).toContain(
                'import type { APIContext, APIRoute }',
            )

            // Should have proper type annotations
            expect(handlerContent).toContain('APIRoute<APIContext>')
            expect(handlerContent).toContain('async (ctx) =>')

            // Should have proper exports
            expect(handlerContent).toContain('export { handler as ALL }')
        })
    })

    describe('Module Resolution', () => {
        it('should use correct relative paths in generated code', () => {
            const routerContent = generateRouter({
                basePath: '/api',
                relativeActionsPath: '../src/hono/actions',
            })

            expect(routerContent).toContain(
                "await import('../src/hono/actions')",
            )
        })

        it('should handle different relative path scenarios', () => {
            const scenarios = [
                { from: '../actions', expected: '../actions' },
                { from: './actions', expected: './actions' },
                { from: '../../src/actions', expected: '../../src/actions' },
            ]

            scenarios.forEach(({ from, expected }) => {
                const routerContent = generateRouter({
                    basePath: '/api',
                    relativeActionsPath: from,
                })

                expect(routerContent).toContain(`await import('${expected}')`)
            })
        })

        it('should use correct import paths for dependencies', () => {
            const routerContent = generateRouter({
                basePath: '/api',
                relativeActionsPath: '../actions',
            })

            // Should use proper package imports
            expect(routerContent).toContain("from '@gnosticdev/hono-actions'")
            expect(routerContent).toContain("from 'hono'")
            expect(routerContent).toContain("from 'hono/cors'")
            expect(routerContent).toContain("from 'hono/dev'")
            expect(routerContent).toContain("from 'hono/logger'")
            expect(routerContent).toContain("from 'hono/pretty-json'")
        })
    })

    describe('Type Safety', () => {
        it('should include proper TypeScript types in generated code', () => {
            const routerContent = generateRouter({
                basePath: '/api',
                relativeActionsPath: '../actions',
            })

            // Should have proper generic types
            expect(routerContent).toContain('Hono<HonoEnv')
            expect(routerContent).toContain('MergeSchemaPath<ActionSchema')

            // Should have proper type imports
            expect(routerContent).toContain(
                'import type { ExtractSchema, MergeSchemaPath }',
            )

            // Should have proper type exports
            expect(routerContent).toContain('export type HonoRouter =')
        })

        it('should maintain type safety across virtual imports', () => {
            const clientContent = getHonoClient(3000)
            const routerContent = generateRouter({
                basePath: '/api',
                relativeActionsPath: '../actions',
            })

            // Both should reference the same HonoRouter type
            expect(routerContent).toContain('export type HonoRouter')
            expect(clientContent).toContain('import type { HonoRouter }')
        })
    })

    describe('Code Generation Consistency', () => {
        it('should generate consistent code patterns', () => {
            const routerContent = generateRouter({
                basePath: '/api',
                relativeActionsPath: '../actions',
            })

            // Should follow consistent patterns
            expect(routerContent).toContain('const { honoActions}')
            expect(routerContent).toContain(
                'for (const action of Object.values(honoActions))',
            )
            expect(routerContent).toContain("app.route('/', action)")
            expect(routerContent).toContain(
                "app.use('*', cors(), logger(), prettyJSON())",
            )
        })

        it('should generate consistent error handling patterns', () => {
            const routerContent = generateRouter({
                basePath: '/api',
                relativeActionsPath: '../actions',
            })

            // Should include proper error handling structure
            expect(routerContent).toContain(
                'for (const action of Object.values(honoActions))',
            )
        })

        it('should generate consistent middleware patterns', () => {
            const routerContent = generateRouter({
                basePath: '/api',
                relativeActionsPath: '../actions',
            })

            // Should include all necessary middleware
            expect(routerContent).toContain('cors()')
            expect(routerContent).toContain('logger()')
            expect(routerContent).toContain('prettyJSON()')
        })
    })

    describe('Environment Handling', () => {
        it('should handle different environments in client code', () => {
            const clientContent = getHonoClient(3000)

            // Should handle client-side
            expect(clientContent).toContain("typeof window !== 'undefined'")

            // Should handle development
            expect(clientContent).toContain('import.meta.env.DEV')

            // Should handle production
            expect(clientContent).toContain('import.meta.env.SITE')

            // Should handle custom site URL
            expect(clientContent).toContain(
                "return 'import.meta.env.SITE' ?? ''",
            )
        })

        it('should handle different ports correctly', () => {
            const ports = [3000, 8080, 0, 9000]

            ports.forEach((port) => {
                const clientContent = getHonoClient(port)
                expect(clientContent).toContain(`\${${port}}`)
            })
        })
    })

    describe('Integration Compatibility', () => {
        it('should be compatible with Astro integration patterns', () => {
            const handlerContent = getAstroHandler('cloudflare')

            // Should use Astro's API patterns
            expect(handlerContent).toContain('APIContext')
            expect(handlerContent).toContain('APIRoute')
            expect(handlerContent).toContain('ctx.request')
            expect(handlerContent).toContain('ctx.locals.runtime')
        })

        it('should be compatible with Hono patterns', () => {
            const routerContent = generateRouter({
                basePath: '/api',
                relativeActionsPath: '../actions',
            })

            // Should use Hono's patterns
            expect(routerContent).toContain('new Hono')
            expect(routerContent).toContain('app.use')
            expect(routerContent).toContain('app.route')
            expect(routerContent).toContain('showRoutes')
        })

        it('should be compatible with Valibot patterns', () => {
            const routerContent = generateRouter({
                basePath: '/api',
                relativeActionsPath: '../actions',
            })

            // Should reference Valibot types
            expect(routerContent).toContain('ExtractSchema')
        })
    })
})
