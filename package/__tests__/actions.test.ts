import { z } from 'astro/zod'
import { beforeEach, describe, expect, it, jest } from 'bun:test'
import { Hono } from 'hono'
import { showRoutes } from 'hono/dev'
import { createFactory } from 'hono/factory'
import { logger } from 'hono/logger'
import { prettyJSON } from 'hono/pretty-json'
import { testClient } from 'hono/testing'
import type { Bindings, Schema } from 'hono/types'
import { defineHonoAction } from '../src/actions'
import { HonoActionError } from '../src/error'

interface HonoEnv {
    Bindings: {
        SOME_API_KEY?: string
        ASTRO_LOCALS?: {
            kv: {
                getItem: (key: string) => Promise<any>
                setItem: (key: string, value: any) => Promise<void>
            }
            sessionId: string
        }
    }
    Variables: Record<string, unknown>
}

const appFactory = createFactory<HonoEnv>()

interface ActionResponse<T> {
    data: T | null
    error: { code: string; message: string } | null
}

describe('Hono Actions', () => {
    let app: Hono<HonoEnv>

    beforeEach(() => {
        app = appFactory.createApp().basePath('/api')
        app.use(logger(), prettyJSON())
    })

    describe('defineHonoAction', () => {
        it('should create a valid action with successful response', async () => {
            // Define a simple test action
            const testAction = defineHonoAction({
                schema: z.object({
                    name: z.string(),
                    age: z.number(),
                }),
                handler: async (input, _c) => {
                    return {
                        message: `Hello ${input.name}, you are ${input.age} years old`,
                    }
                },
            })

            // Mount the action to our test app
            app.route('/test', testAction)
            showRoutes(app, { colorize: true, verbose: true })

            // Test the action with valid input
            const res = await app.request('/api/test', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: 'John',
                    age: 30,
                }),
            })

            expect(res.status).toBe(200)
            const json = await res.json()
            expect(json).toEqual({
                data: {
                    message: 'Hello John, you are 30 years old',
                },
                error: null,
            })
        })

        it('should handle validation errors correctly', async () => {
            const schema = z.object({
                email: z.string().email(),
                age: z.number().min(18),
            })

            const testAction = defineHonoAction({
                schema,
                handler: async (input) => {
                    return input
                },
            })

            app.route('/validation-error', testAction)

            const res = await app.request('/api/validation-error', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email: 'invalid-email',
                    age: 15,
                }),
            })

            expect(res.status).toBe(400)
            const json = (await res.json()) as ActionResponse<unknown>
            expect(json.data).toBeNull()
            expect(json.error).toBeDefined()
        })

        it('should handle action errors correctly', async () => {
            const schema = z.object({
                shouldError: z.boolean(),
            })

            const testAction = defineHonoAction({
                schema,
                handler: async (input) => {
                    if (input.shouldError) {
                        throw new HonoActionError({
                            message: 'Test error',
                            code: 'UNKNOWN_ERROR',
                        })
                    }
                    return input
                },
            })

            app.route('/error', testAction)

            const res = await app.request('/api/error', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    shouldError: true,
                }),
            })

            expect(res.status).toBe(500)
            const json = (await res.json()) as ActionResponse<unknown>
            expect(json.data).toBeNull()
            expect(json.error).not.toBeNull()
            expect(json.error?.code).toBe('UNKNOWN_ERROR')
        })
    })
})

// Test the action routes integration
describe('Action Routes', () => {
    it('should properly integrate multiple actions', async () => {
        const schema1 = z.object({ field: z.string() })
        const schema2 = z.object({ number: z.number() })

        const actions = {
            action1: defineHonoAction({
                schema: schema1,
                handler: async (input) => input,
            }),
            action2: defineHonoAction({
                schema: schema2,
                handler: async (input) => input,
            }),
        }

        const app = new Hono<HonoEnv, Schema>().basePath('/api/_actions')

        app.route('/action1', actions.action1)
        app.route('/action2', actions.action2)

        // Test first action
        const res1 = await app.request('/api/_actions/action1', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ field: 'test' }),
        })
        expect(res1.status).toBe(200)

        // Test second action
        const res2 = await app.request('/api/_actions/action2', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ number: 42 }),
        })
        expect(res2.status).toBe(200)
    })
})

// Test environment bindings
describe('Environment Bindings', () => {
    it('should handle environment variables correctly', async () => {
        const mockEnv = {
            SOME_API_KEY: 'test-key',
            ASTRO_LOCALS: {
                kv: {
                    getItem: jest.fn().mockResolvedValue({ some: 'data' }),
                    setItem: jest.fn().mockResolvedValue(undefined),
                },
                sessionId: 'test-session',
            },
        }
        type MockBindings = typeof mockEnv

        interface MockEnv {
            Bindings: MockBindings
            Variables: Record<string, unknown>
        }

        const testAction = defineHonoAction({
            schema: z.object({
                test: z.string(),
            }),
            handler: async (_input, c) => {
                const env = c.env as MockBindings

                // Test accessing environment variables
                const apiKey = env.SOME_API_KEY
                const sessionData = await env.ASTRO_LOCALS.kv.getItem(
                    env.ASTRO_LOCALS.sessionId,
                )
                return { apiKey, sessionData }
            },
        })

        const app = new Hono<MockEnv>().basePath('/api')
        app.use('*', (c, next) => {
            c.env = mockEnv
            return next()
        }).route('/test-env', testAction)

        const res = await app.request(
            '/api/test-env',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ test: 'value' }),
            },
            mockEnv,
        )

        expect(res.status).toBe(200)

        const json = await res.json()
        expect(json.data.apiKey).toBe('test-key')
        expect(json.data.sessionData).toEqual({ some: 'data' })
    })
})

describe('Hono Client', () => {
    const app = appFactory.createApp().basePath('/api')
    const routes = app
        .route(
            '/test',
            defineHonoAction({
                schema: z.object({
                    name: z.string(),
                    age: z.number(),
                }),
                handler: async (input) => input,
            }),
        )
        .route(
            '/test2',
            defineHonoAction({
                schema: z.object({
                    name2: z.string(),
                    age2: z.number(),
                }),
                handler: async (input) => input,
            }),
        )

    const client = testClient(routes)

    it('should be able to call an action', async () => {
        const res = await client.api.test.$post({
            json: {
                name: 'John',
                age: 30,
            },
        })
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({
            data: {
                name: 'John',
                age: 30,
            },
            error: null,
        })
    })
})
