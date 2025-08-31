import { vValidator } from '@hono/valibot-validator'
import type { Context } from 'hono'
import { createFactory } from 'hono/factory'
import * as v from 'valibot'
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

type HonoActionSchema =
    | v.ObjectSchema<v.ObjectEntries, v.ErrorMessage<v.ObjectIssue> | undefined>
    | v.NeverSchema<undefined>

interface HonoActionContext<
    TEnv extends HonoEnv,
    TPath extends string,
    TSchema extends HonoActionSchema,
> extends Context<
        TEnv,
        TPath,
        {
            input: v.InferInput<TSchema>
            output: v.InferOutput<TSchema>
            outputFormat: 'json'
        }
    > {
    env: TEnv['Bindings']
}

type HonoActionParams<
    TPath extends string,
    TSchema extends HonoActionSchema,
    TReturn,
    TEnv extends HonoEnv = HonoEnv,
> = {
    path: TPath
    schema?: TSchema
    handler: (
        params: v.InferOutput<TSchema>,
        context: HonoActionContext<TEnv, TPath, TSchema>,
    ) => Promise<TReturn>
}

/**
 * Defines a type-safe Hono action using Valibot for input validation.
 *
 * @param path - The path of the action.
 * @param schema - The object schema for Valibot validation.
 * @default never
 * @param handler - The handler function for the action.
 * @returns A Hono app instance with the defined route
 */
export function defineHonoAction<
    TPath extends string,
    TSchema extends HonoActionSchema,
    TReturn,
    TEnv extends HonoEnv = HonoEnv,
>({ path, schema, handler }: HonoActionParams<TPath, TSchema, TReturn, TEnv>) {
    const factory = createFactory<TEnv, TPath>()
    const app = factory.createApp()

    const route = app.post(
        path,
        vValidator(
            'json',
            schema ?? v.union([v.never(), v.object({})]),
            async (result, c) => {
                if (!result.success) {
                    console.error(result.issues)
                    return c.json(
                        {
                            data: null,
                            error: new HonoActionError({
                                message: result.issues[0].message,
                                code: 'INPUT_VALIDATION_ERROR',
                                issue: result.issues[0],
                            }),
                        },
                        400,
                    )
                }
            },
        ),
        async (c) => {
            try {
                const json = c.req.valid('json')

                // context is validated after the middleware, but we only need the original definition to be passed back in to the handler here.
                const result = await handler(
                    json,
                    c as unknown as HonoActionContext<TEnv, TPath, TSchema>,
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
