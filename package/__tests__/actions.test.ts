import { beforeEach, describe, expect, it, jest } from 'bun:test'
import { Hono } from 'hono'
import { showRoutes } from 'hono/dev'
import { createFactory } from 'hono/factory'
import { logger } from 'hono/logger'
import { prettyJSON } from 'hono/pretty-json'
import { testClient } from 'hono/testing'
import type { Bindings, Schema } from 'hono/types'
import * as v from 'valibot'
import { objectEntries } from '../../../src/lib/utils'
import { HonoActionError, defineHonoAction } from '../src/index'

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
        path: '/test',
        schema: v.object({
          name: v.string(),
          age: v.number(),
        }),
        handler: async (input, _c) => {
          return {
            message: `Hello ${input.name}, you are ${input.age} years old`,
          }
        },
      })

      // Mount the action to our test app
      app.route('/', testAction)
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
      const schema = v.object({
        email: v.pipe(v.string(), v.email()),
        age: v.pipe(v.number(), v.minValue(18)),
      })

      const testAction = defineHonoAction({
        path: '/validation-error',
        schema,
        handler: async (input) => {
          return input
        },
      })

      app.route('/', testAction)

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
      const schema = v.object({
        shouldError: v.boolean(),
      })

      const testAction = defineHonoAction({
        path: '/error',
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

      app.route('/', testAction)

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
    const schema1 = v.object({ field: v.string() })
    const schema2 = v.object({ number: v.number() })

    const actions = {
      action1: defineHonoAction({
        path: '/action1',
        schema: schema1,
        handler: async (input) => input,
      }),
      action2: defineHonoAction({
        path: '/action2',
        schema: schema2,
        handler: async (input) => input,
      }),
    }

    const app = new Hono<HonoEnv, Schema>().basePath('/api/_actions')

    app.route('/', actions.action1)
    app.route('/', actions.action2)
    const _routes = objectEntries(actions).map(([_key, action]) =>
      app.route('/', action),
    )

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

    const app = new Hono<MockEnv>()

    type MockBindings = Bindings & typeof mockEnv

    interface MockEnv {
      Bindings: MockBindings
      Variables: any
    }

    const testAction = defineHonoAction<
      '/api/test-env',
      v.ObjectSchema<
        v.ObjectEntries,
        v.ErrorMessage<v.ObjectIssue> | undefined
      >,
      unknown,
      MockEnv
    >({
      path: '/api/test-env',
      schema: v.object({
        test: v.string(),
      }),
      handler: async (_input, c) => {
        // Test accessing environment variables
        const apiKey = c.env.SOME_API_KEY
        const sessionData = await c.env.ASTRO_LOCALS.kv.getItem(
          c.env.ASTRO_LOCALS.sessionId,
        )
        return { apiKey, sessionData }
      },
    })

    const route = app.route('/', testAction)

    const res = await route.request(
      '/api/test-env',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: 'value' }),
      },
      mockEnv,
    )

    expect(res.status).toBe(200)

    const json = (await res.json()) as any
    expect(json.data.apiKey).toBe('test-key')
    expect(json.data.sessionData).toEqual({ some: 'data' })
  })
})

describe('Hono Client', () => {
  const app = appFactory.createApp().basePath('/api')
  const routes = app
    .route(
      '/',
      defineHonoAction({
        path: '/test',
        schema: v.object({
          name: v.string(),
          age: v.number(),
        }),
        handler: async (input) => input,
      }),
    )
    .route(
      '/',
      defineHonoAction({
        path: '/test2',
        schema: v.object({
          name2: v.string(),
          age2: v.number(),
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
