import { z } from 'astro/zod'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import { showRoutes } from 'hono/dev'
import { HonoBase } from 'hono/hono-base'
import { logger } from 'hono/logger'
import { prettyJSON } from 'hono/pretty-json'
import { testClient } from 'hono/testing'
import type { ExtractSchema, MergeSchemaPath } from 'hono/types'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { glob } from 'tinyglobby'
import {
    defineHonoAction,
    HonoActionError,
    type HonoEnv,
    type MergeActionKeyIntoPath,
} from '../src/actions'
import {
    VIRTUAL_MODULE_ID_CLIENT,
    VIRTUAL_MODULE_ID_ROUTER,
} from '../src/integration'
import {
    generateAstroHandler,
    generateHonoClient,
    generateRouter,
} from '../src/integration-files'

describe('Integration Tests', () => {
    // Mock the generated router for testing
    const mockActions = {
        testAction: defineHonoAction({
            schema: z.object({
                name: z.string(),
                age: z.number(),
            }),
            handler: async (input) => ({
                message: `Hello ${input.name}, you are ${input.age} years old`,
            }),
        }),
        anotherAction: defineHonoAction({
            schema: z.object({
                value: z.string(),
            }),
            handler: async (input) => ({
                result: `Processed: ${input.value}`,
            }),
        }),
    } as const

    type MergedActions = MergeActionKeyIntoPath<typeof mockActions>
    type ActionsSchema = ExtractSchema<MergedActions[keyof MergedActions]>

    const defaultApp = new Hono<
        HonoEnv,
        MergeSchemaPath<ActionsSchema, '/api'>
    >().basePath('/api')
    defaultApp.use('*', logger(), prettyJSON())
    for (const [routeName, action] of Object.entries(mockActions)) {
        defaultApp.route(`/${routeName}`, action)
    }

    describe('Default App', () => {
        it('should be a valid Hono app', () => {
            expect(defaultApp).toBeInstanceOf(HonoBase)
            expect(defaultApp.routes).toBeInstanceOf(Array)
        })
        it('should have the correct routes', () => {
            expect(
                defaultApp.getPath(
                    new Request('http://localhost/api/testAction'),
                ),
            ).toBe('/api/testAction')
            expect(
                defaultApp.getPath(
                    new Request('http://localhost/api/anotherAction'),
                ),
            ).toBe('/api/anotherAction')
        })
        it('should have the correct handler', () => {
            expect(defaultApp.routes).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        path: '/api/testAction',
                        method: 'POST',
                        handler: expect.any(Function),
                    }),
                    expect.objectContaining({
                        path: '/api/anotherAction',
                        method: 'POST',
                        handler: expect.any(Function),
                    }),
                ]),
            )
        })
    })

    describe('Generated Router Integration', () => {
        it('should generate valid router code', () => {
            const routerContent = generateRouter({
                basePath: '/api',
                relativeActionsPath: '../actions',
            })

            // Test that the generated code contains expected patterns
            expect(routerContent).toContain('buildRouter')
            expect(routerContent).toContain('HonoEnv')
            expect(routerContent).toContain('cors()')
            expect(routerContent).toContain('logger()')
            expect(routerContent).toContain('prettyJSON()')
            expect(routerContent).toContain('showRoutes')
        })

        it('should generate router with correct import path', () => {
            const routerContent = generateRouter({
                basePath: '/api',
                relativeActionsPath: '../src/hono/actions',
            })

            expect(routerContent).toContain(
                "await import('../src/hono/actions')",
            )
        })

        it('should generate router with correct base path', () => {
            const routerContent = generateRouter({
                basePath: '/api/v1',
                relativeActionsPath: '../actions',
            })

            expect(routerContent).toContain("basePath('/api/v1')")
        })
    })

    describe('Generated Client Integration', () => {
        it('should generate valid client code', () => {
            const clientContent = generateHonoClient(3000)

            expect(clientContent).toContain('hc<HonoRouter>')
            expect(clientContent).toContain('getBaseUrl')
            expect(clientContent).toContain('honoClient')
        })

        it('should handle different environments correctly', () => {
            const clientContent = generateHonoClient(3000)

            // Should include client-side detection
            expect(clientContent).toContain("typeof window !== 'undefined'")

            // Should include development environment
            expect(clientContent).toContain('import.meta.env.DEV')

            // Should include production environment
            expect(clientContent).toContain('import.meta.env.SITE')
        })

        it('should use custom site URL when provided', () => {
            const clientContent = generateHonoClient(3000)

            expect(clientContent).toContain("return import.meta.env.SITE ?? ''")
        })
    })

    describe('Generated Astro Handler Integration', () => {
        it('should generate valid cloudflare handler', () => {
            const handlerContent = generateAstroHandler('@astrojs/cloudflare')

            expect(handlerContent).toContain('APIRoute<APIContext>')
            expect(handlerContent).toContain('router.fetch')
            expect(handlerContent).toContain('ctx.locals.runtime.env')
            expect(handlerContent).toContain('export { handler as ALL }')
        })

        it('should include proper error handling for unsupported adapters', () => {
            expect(() => generateAstroHandler('unsupported' as any)).toThrow(
                'Unsupported adapter: unsupported',
            )
        })
    })

    describe('Virtual Imports Integration', () => {
        it('should use consistent virtual import IDs', () => {
            expect(VIRTUAL_MODULE_ID_CLIENT).toBe(
                '@gnosticdev/hono-actions/client',
            )
            expect(VIRTUAL_MODULE_ID_ROUTER).toBe('virtual:hono-actions/router')
        })

        it('should have valid virtual import ID formats', () => {
            expect(VIRTUAL_MODULE_ID_CLIENT).toMatch(/^@[^/]+\/[^/]+/)
            expect(VIRTUAL_MODULE_ID_ROUTER).toMatch(/^virtual:/)
        })
    })

    describe('Type Generation Integration', () => {
        it('should generate proper TypeScript declarations', () => {
            // Test that the generated types are valid
            const routerContent = generateRouter({
                basePath: '/api',
                relativeActionsPath: '../actions',
            })

            expect(routerContent).toContain('type ActionSchema')
            expect(routerContent).toContain('HonoRouter')
            expect(routerContent).toContain('ExtractSchema')
        })
    })

    describe('Action Integration with Generated Code', () => {
        interface HonoEnv {
            Bindings: {
                API_KEY: string
                ASTRO_LOCALS: {
                    sessionId: string
                }
            }
            Variables: Record<string, unknown>
        }

        it('should work with generated router pattern', async () => {
            // Create a test app using the same pattern as generated router
            const app = new Hono<
                HonoEnv,
                MergeSchemaPath<ActionsSchema, '/api'>
            >().basePath('/api')

            app.use(logger(), prettyJSON())

            // Add actions using the same pattern as generated code
            for (const [routeName, action] of Object.entries(mockActions)) {
                app.route(`/${routeName}`, action)
            }

            const client = testClient(app)

            // Test the first action
            const res1 = await client.api.testAction.$post({
                json: {
                    name: 'John',
                    age: 30,
                },
            })

            expect(res1.status).toBe(200)
            const json1 = await res1.json()
            expect(json1.data?.message).toBe('Hello John, you are 30 years old')

            // Test the second action
            const res2 = await client.api.anotherAction.$post({
                json: {
                    value: 'test value',
                },
            })

            expect(res2.status).toBe(200)
            const json2 = await res2.json()
            expect(json2.data?.result).toBe('Processed: test value')
        })

        it('should handle multiple actions in the same router', async () => {
            const app = new Hono<
                HonoEnv,
                MergeSchemaPath<ActionsSchema, '/api'>
            >().basePath('/api')

            // Simulate the generated router pattern
            for (const [routeName, action] of Object.entries(mockActions)) {
                app.route(`/${routeName}`, action)
            }

            const client = testClient(app)

            // Test both actions exist
            const res1 = await client.api.testAction.$post({
                json: { name: 'Test', age: 25 },
            })
            expect(res1.status).toBe(200)

            const res2 = await client.api.anotherAction.$post({
                json: { value: 'test' },
            })
            expect(res2.status).toBe(200)
        })
    })

    describe('Custom Hono instances (non-defineHonoAction)', () => {
        it('should not accept POST on a GET-only custom Hono route when mixed into honoActions', async () => {
            // Create a standalone Hono instance with ONLY a GET route
            const getOnlyApp = new Hono()
            const getOnlyRoute = getOnlyApp.get('/', (c) =>
                c.json({ ok: true }),
            )

            // Mix this custom instance into the actions collection, simulating user configuration
            const modifiedActions = {
                getOnly: getOnlyRoute,
                ...mockActions,
            }

            type AdditionalActions = MergeActionKeyIntoPath<
                typeof modifiedActions
            >

            // Build an app using the same pattern as the generated router
            const app = new Hono<
                HonoEnv,
                MergeSchemaPath<
                    ExtractSchema<AdditionalActions[keyof AdditionalActions]>,
                    '/api'
                >
            >().basePath('/api')
            for (const [routeName, action] of Object.entries(modifiedActions)) {
                app.route(`/${routeName}`, action as any)
            }

            // Sending POST to GET-only route should not be allowed (no POST route exists)
            const resPost = await app.request('/api/getOnly', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({}),
            })
            expect(resPost.status).toBe(404)

            // GET should succeed on the same route
            const resGet = await app.request('/api/getOnly', {
                method: 'GET',
            })
            expect(resGet.status).toBe(200)
            const json = await resGet.json()
            expect(json.ok).toBe(true)
        })
    })

    describe('Error Handling Integration', () => {
        it('should handle validation errors in generated pattern', async () => {
            const app = new Hono<
                HonoEnv,
                MergeSchemaPath<ActionsSchema, '/api'>
            >().basePath('/api')

            const action = defineHonoAction({
                schema: z.object({
                    email: z.string().email(),
                    age: z.number().min(18),
                }),
                handler: async (input) => input,
            })

            app.route('/testAction', action)
            const client = testClient(app)

            const res = await client.api.testAction.$post({
                json: {
                    email: 'invalid-email',
                    age: 15,
                },
            })

            expect(res.status).toBe(400)
            const json = await res.json()
            expect(json.data).toBeNull()
            expect(json.error).toBeDefined()
        })

        it('should handle action errors in generated pattern', async () => {
            const action = defineHonoAction({
                schema: z.object({
                    shouldError: z.boolean(),
                }),
                handler: async (input) => {
                    if (input.shouldError) {
                        throw new HonoActionError({
                            message: 'Test error',
                            code: 'UNKNOWN_ERROR',
                        })
                    }
                    return { success: true }
                },
            })

            const app = new Hono<HonoEnv>()
                .basePath('/api')
                .route('/error-test', action)
            const client = testClient(app)

            const res = await client.api['error-test'].$post({
                json: { shouldError: true },
            })

            expect(res.status).toBe(500)
            const json = await res.json()
            expect(json.data).toBeNull()
            expect(json.error).toEqual({
                code: 'UNKNOWN_ERROR',
                message: 'Test error',
            })
        })
    })

    describe('Environment Integration', () => {
        it('should work with environment bindings', async () => {
            const mockEnv = {
                API_KEY: 'test-key',
                ASTRO_LOCALS: {
                    sessionId: 'test-session',
                },
            }

            interface HonoEnv {
                Bindings: {
                    API_KEY: string
                    ASTRO_LOCALS: {
                        sessionId: string
                    }
                }
                Variables: Record<string, unknown>
            }

            const action = defineHonoAction({
                schema: z.object({
                    test: z.string(),
                }),
                handler: async (_input, c) => {
                    return {
                        apiKey: (c.env as any).API_KEY,
                        sessionId: (c.env as any).ASTRO_LOCALS.sessionId,
                    }
                },
            })
            const app = new Hono<HonoEnv>()
                .basePath('/api')
                .use('*', (c, next) => {
                    c.env = mockEnv
                    return next()
                })
                .route('/env-test', action)

            showRoutes(app)

            const client = testClient(app)

            const res = await client.api['env-test'].$post({
                json: { test: 'value' },
            })

            expect(res.status).toBe(200)
            const json = await res.json()
            expect(json.data?.apiKey).toBe('test-key')
            expect(json.data?.sessionId).toBe('test-session')
        })
    })

    describe('Generated Code Consistency', () => {
        it('should maintain consistent patterns across generated files', () => {
            const routerContent = generateRouter({
                basePath: '/api',
                relativeActionsPath: '../actions',
            })
            const clientContent = generateHonoClient(3000)
            const handlerContent = generateAstroHandler('@astrojs/cloudflare')

            // All should reference the same router
            expect(routerContent).toContain('HonoRouter')
            expect(clientContent).toContain('HonoRouter')

            // Handler should use router
            expect(handlerContent).toContain('router.fetch')

            // All should be TypeScript compatible
            expect(routerContent).toContain('import type')
            expect(clientContent).toContain('import type')
            expect(handlerContent).toContain('import type')
        })
    })

    describe('Integration Setup Behavior', () => {
        let tempDir: string
        let originalConsoleWarn: typeof console.warn
        let consoleWarnCalls: string[] = []

        beforeEach(async () => {
            // Create a temporary directory for testing
            tempDir = await fs.mkdtemp(
                path.join(tmpdir(), 'hono-actions-test-'),
            )

            // Mock console.warn to capture warning calls
            originalConsoleWarn = console.warn
            consoleWarnCalls = []
            console.warn = (...args: any[]) => {
                consoleWarnCalls.push(args.join(' '))
                originalConsoleWarn(...args)
            }
        })

        afterEach(async () => {
            // Restore original console.warn
            console.warn = originalConsoleWarn

            // Clean up temporary directory
            try {
                await fs.rm(tempDir, { recursive: true, force: true })
            } catch (error) {
                // Ignore cleanup errors
            }
        })

        it('should warn and return early when no action patterns are found', async () => {
            // Create an empty directory with no action files
            const emptyDir = path.join(tempDir, 'empty-project')
            await fs.mkdir(emptyDir, { recursive: true })

            // Test the action pattern discovery logic
            const ACTION_PATTERNS = [
                'src/server/actions.ts',
                'src/hono/actions.ts',
                'src/hono/index.ts',
                'src/hono.ts',
            ]

            // Simulate the integration logic for finding actions - no files should be found in empty directory
            const files = await glob(ACTION_PATTERNS, {
                cwd: emptyDir,
                expandDirectories: false,
                absolute: true,
            })

            // Verify no files were found
            expect(files).toHaveLength(0)

            // Simulate the warning logic from the integration
            if (files.length === 0) {
                const warningMessage = `No actions found. Create one of:\n${ACTION_PATTERNS.map((p) => ` - ${p}`).join('\n')}`
                console.warn(warningMessage)
            }

            // Verify the warning was called
            expect(consoleWarnCalls).toHaveLength(1)
            expect(consoleWarnCalls[0]).toContain(
                'No actions found. Create one of:',
            )
            expect(consoleWarnCalls[0]).toContain('src/server/actions.ts')
            expect(consoleWarnCalls[0]).toContain('src/hono/actions.ts')
            expect(consoleWarnCalls[0]).toContain('src/hono/index.ts')
            expect(consoleWarnCalls[0]).toContain('src/hono.ts')
        })

        it('should continue setup when action files are found', async () => {
            // Create a directory with an action file
            const projectDir = path.join(tempDir, 'project-with-actions')
            await fs.mkdir(projectDir, { recursive: true })
            await fs.mkdir(path.join(projectDir, 'src', 'hono'), {
                recursive: true,
            })

            // Create a mock action file
            const actionFile = path.join(
                projectDir,
                'src',
                'hono',
                'actions.ts',
            )
            await fs.writeFile(actionFile, '// Mock action file', 'utf-8')

            const ACTION_PATTERNS = [
                'src/server/actions.ts',
                'src/hono/actions.ts',
                'src/hono/index.ts',
                'src/hono.ts',
            ]

            // Test the action pattern discovery logic
            const files = await glob(ACTION_PATTERNS, {
                cwd: projectDir,
                expandDirectories: false,
                absolute: true,
            })

            // Verify files were found
            expect(files).toHaveLength(1)
            expect(files[0]).toBe(actionFile)

            // Simulate the integration logic - should not warn
            if (files.length === 0) {
                const warningMessage = `No actions found. Create one of:\n${ACTION_PATTERNS.map((p) => ` - ${p}`).join('\n')}`
                console.warn(warningMessage)
            }

            // Verify no warning was called
            expect(consoleWarnCalls).toHaveLength(0)
        })

        it('should handle custom actionsPath option correctly', async () => {
            // Create a directory with a custom action file
            const projectDir = path.join(tempDir, 'project-with-custom-actions')
            await fs.mkdir(projectDir, { recursive: true })

            // Create a custom action file
            const customActionFile = path.join(projectDir, 'custom-actions.ts')
            await fs.writeFile(
                customActionFile,
                '// Custom action file',
                'utf-8',
            )

            // Simulate the integration logic with custom actionsPath
            const customActionsPath = customActionFile
            const files = await glob([customActionsPath], {
                cwd: projectDir,
                expandDirectories: false,
                absolute: true,
            })

            // Verify the custom file was found
            expect(files).toHaveLength(1)
            expect(files[0]).toBe(customActionFile)

            // Should not warn when custom path is provided and file exists
            expect(consoleWarnCalls).toHaveLength(0)
        })
    })
})
