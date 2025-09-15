import { zValidator } from '@hono/zod-validator'
import { z } from 'astro/zod'
import type { Context, Hono as HonoInstance } from 'hono'
import { Hono } from 'hono/quick'
import type { MergeSchemaPath } from 'hono/types'
import { HonoActionError } from './error.js'

export { HonoActionError } from './error.js'

// Augmentable interface for environment bindings
// Consumers can augment this via module augmentation to get strong typing for c.env

// biome-ignore lint/suspicious/noEmptyInterface: added by user
export interface Bindings {
    /** Cloudflare Bindings */
}

/**
 * HonoEnv is passed to the Hono context to provide types on `ctx.env`.
 *
 * We are using `HonoEnv` to avoid confusion with the Cloudflare types on `Env` -> which cooresponds to `Bindings`
 */
export interface HonoEnv {
    Bindings: Bindings
    Variables: Record<string, unknown>
}

type HonoActionSchema = z.ZodTypeAny

/**
 * Merge each action key into its route path.
 *
 * Given a map of actions where each `Hono` app defines handlers at `"/"`, this
 * transforms the schema so each action's path becomes `"/${key}"`.
 *
 * Example:
 * ```ts
 * declare const honoActions: {
 *   myAction: Hono<HonoEnv, { '/': { $post: any } }, '/'>
 *   anotherAction: Hono<HonoEnv, { '/': { $post: any } }, '/'>
 * }
 *
 * type ActionsWithKeyedPaths = MergeActionKeyIntoPath<typeof honoActions>
 * // => {
 * //   myAction: Hono<HonoEnv, { '/myAction': { $post: any } }, '/'>
 * //   anotherAction: Hono<HonoEnv, { '/anotherAction': { $post: any } }, '/'>
 * // }
 * ```
 */
export type MergeActionKeyIntoPath<
    TActions extends Record<string, HonoInstance<any, any, any>>,
> = {
    [K in keyof TActions]: TActions[K] extends HonoInstance<
        infer TEnv,
        infer TSchema,
        infer TBase
    >
        ? HonoInstance<
              TEnv,
              MergeSchemaPath<TSchema, `/${Extract<K, string>}`>,
              TBase
          >
        : never
}

interface HonoActionContext<
    TEnv extends HonoEnv,
    TSchema extends HonoActionSchema,
> extends Context<
        TEnv,
        '/',
        {
            input: z.input<TSchema>
            output: z.output<TSchema>
            outputFormat: 'json'
        }
    > {
    env: TEnv['Bindings']
}

type HonoActionParams<
    TSchema extends HonoActionSchema,
    TReturn,
    TEnv extends HonoEnv = HonoEnv,
> = {
    schema?: TSchema
    handler: (
        params: z.output<TSchema>,
        context: HonoActionContext<TEnv, TSchema>,
    ) => Promise<TReturn>
}

/**
 * Defines a type-safe Hono action using Zod for input validation.
 *
 * @param schema - The Zod schema for validation (optional).
 * @param handler - The handler function for the action.
 * @returns A Hono app instance with the defined route
 */
export function defineHonoAction<
    TEnv extends HonoEnv,
    TSchema extends HonoActionSchema,
    TReturn,
>({ schema, handler }: HonoActionParams<TSchema, TReturn, TEnv>) {
    const app = new Hono<TEnv>()

    const route = app.post(
        '/',
        zValidator('json', schema ?? z.object({}), async (result, c) => {
            if (!result.success) {
                console.error(result.error.issues)
                const firstIssue = result.error.issues[0]
                return c.json(
                    {
                        data: null,
                        error: new HonoActionError({
                            message: firstIssue?.message || 'Validation error',
                            code: 'INPUT_VALIDATION_ERROR',
                            issue: firstIssue,
                        }),
                    },
                    400,
                )
            }
        }),
        async (c) => {
            try {
                const json = c.req.valid('json')

                // context is validated after the middleware, but we only need the original definition to be passed back in to the handler here.
                const result = await handler(
                    json,
                    c as unknown as HonoActionContext<TEnv, TSchema>,
                )

                return c.json(
                    {
                        data: result,
                        error: null,
                    },
                    200,
                )
            } catch (error) {
                console.error(error)
                let errorMessage = 'Internal server error'
                let errorCode = 'INTERNAL_SERVER_ERROR'

                if (error instanceof HonoActionError) {
                    errorMessage = error.message
                    errorCode = error.code
                }

                return c.json(
                    {
                        data: null,
                        error: {
                            message: errorMessage,
                            code: errorCode,
                        },
                    },
                    500,
                )
            }
        },
    )

    return route
}
