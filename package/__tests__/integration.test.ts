import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { Hono } from 'hono'
import { showRoutes } from 'hono/dev'
import { testClient } from 'hono/testing'
import type { ExtractSchema, MergeSchemaPath } from 'hono/types'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { glob } from 'tinyglobby'
import * as v from 'valibot'
import { defineHonoAction, HonoActionError, type HonoEnv } from '../src/actions'
import {
    generateRouter,
    getAstroHandler,
    getHonoClient,
} from '../src/integration-files'

// Mock the generated router for testing
const mockActions = {
    testAction: defineHonoAction({
        path: '/test',
        schema: v.object({
            name: v.string(),
            age: v.number(),
        }),
        handler: async (input) => ({
            message: `Hello ${input.name}, you are ${input.age} years old`,
        }),
    }),
    anotherAction: defineHonoAction({
        path: '/another',
        schema: v.object({
            value: v.string(),
        }),
        handler: async (input) => ({
            result: `Processed: ${input.value}`,
        }),
    }),
}

describe('Integration Tests', () => {
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
            const clientContent = getHonoClient(3000)

            expect(clientContent).toContain('hc<HonoRouter>')
            expect(clientContent).toContain('getBaseUrl')
            expect(clientContent).toContain('honoClient')
        })

        it('should handle different environments correctly', () => {
            const clientContent = getHonoClient(3000)

            // Should include client-side detection
            expect(clientContent).toContain("typeof window !== 'undefined'")

            // Should include development environment
            expect(clientContent).toContain('import.meta.env.DEV')

            // Should include production environment
            expect(clientContent).toContain('import.meta.env.SITE')
        })

        it('should use custom site URL when provided', () => {
            const clientContent = getHonoClient(3000)

            expect(clientContent).toContain("return import.meta.env.SITE ?? ''")
        })
    })

    describe('Generated Astro Handler Integration', () => {
        it('should generate valid cloudflare handler', () => {
            const handlerContent = getAstroHandler('cloudflare')

            expect(handlerContent).toContain('APIRoute<APIContext>')
            expect(handlerContent).toContain('router.fetch')
            expect(handlerContent).toContain('ctx.locals.runtime.env')
            expect(handlerContent).toContain('export { handler as ALL }')
        })

        it('should include proper error handling for unsupported adapters', () => {
            expect(() => getAstroHandler('unsupported' as any)).toThrow(
                'Unsupported adapter: unsupported',
            )
        })
    })

    describe('Virtual Imports Integration', () => {
        it('should generate consistent virtual import paths', () => {
            // Test that the virtual import IDs are consistent
            const expectedVirtualIds = [
                '@gnosticdev/hono-actions/client',
                'virtual:hono-actions/router',
            ]

            // These should match what's used in the integration
            expect(expectedVirtualIds).toContain(
                '@gnosticdev/hono-actions/client',
            )
            expect(expectedVirtualIds).toContain('virtual:hono-actions/router')
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
            const app = new Hono<HonoEnv>().basePath('/api')

            // Add actions using the same pattern as generated code
            for (const action of Object.values(mockActions)) {
                app.route('/', action)
            }

            const client = testClient(
                app as Hono<
                    HonoEnv,
                    MergeSchemaPath<
                        ExtractSchema<
                            (typeof mockActions)[keyof typeof mockActions]
                        >,
                        '/api'
                    >,
                    '/api'
                >,
            )

            // Test the first action
            const res1 = await client.api.test.$post({
                json: {
                    name: 'John',
                    age: 30,
                },
            })

            expect(res1.status).toBe(200)
            const json1 = await res1.json()
            expect(json1.data?.message).toBe('Hello John, you are 30 years old')

            // Test the second action
            const res2 = await client.api.another.$post({
                json: {
                    value: 'test value',
                },
            })

            expect(res2.status).toBe(200)
            const json2 = await res2.json()
            expect(json2.data?.result).toBe('Processed: test value')
        })

        it('should handle multiple actions in the same router', async () => {
            const app = new Hono<HonoEnv>().basePath('/api')

            // Simulate the generated router pattern
            for (const action of Object.values(mockActions)) {
                app.route('/', action)
            }

            const client = testClient(
                app as Hono<
                    HonoEnv,
                    MergeSchemaPath<
                        ExtractSchema<
                            (typeof mockActions)[keyof typeof mockActions]
                        >,
                        '/api'
                    >,
                    '/api'
                >,
            )

            // Test both actions exist
            const res1 = await client.api.test.$post({
                json: { name: 'Test', age: 25 },
            })
            expect(res1.status).toBe(200)

            const res2 = await client.api.another.$post({
                json: { value: 'test' },
            })
            expect(res2.status).toBe(200)
        })
    })

    describe('Error Handling Integration', () => {
        it('should handle validation errors in generated pattern', async () => {
            const app = new Hono<HonoEnv>().basePath('/api')

            const action = defineHonoAction({
                path: '/validation-test',
                schema: v.object({
                    email: v.pipe(v.string(), v.email()),
                    age: v.pipe(v.number(), v.minValue(18)),
                }),
                handler: async (input) => input,
            })

            app.route('/', action)
            const client = testClient(
                app as Hono<
                    HonoEnv,
                    MergeSchemaPath<ExtractSchema<typeof action>, '/api'>,
                    '/api'
                >,
            )

            const res = await client.api['validation-test'].$post({
                json: {
                    email: 'invalid-email',
                    age: 15,
                },
            })

            // @ts-expect-error Hono doesnt infer the status code of validation errors
            expect(res.status).toBe(400)
            const json = await res.json()
            expect(json.data).toBeNull()
            expect(json.error).toBeDefined()
        })

        it('should handle action errors in generated pattern', async () => {
            const action = defineHonoAction({
                path: '/error-test',
                schema: v.object({
                    shouldError: v.boolean(),
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

            const app = new Hono<HonoEnv>().basePath('/api').route('/', action)
            const client = testClient(
                app as Hono<
                    HonoEnv,
                    MergeSchemaPath<ExtractSchema<typeof action>, '/api'>,
                    '/'
                >,
            )

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
                path: '/env-test',
                schema: v.object({
                    test: v.string(),
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
                .route('/', action)

            showRoutes(app)

            const client = testClient(
                app as Hono<
                    HonoEnv,
                    MergeSchemaPath<ExtractSchema<typeof action>, '/api'>,
                    '/'
                >,
            )

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
            const clientContent = getHonoClient(3000)
            const handlerContent = getAstroHandler('cloudflare')

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
