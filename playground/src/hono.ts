import { defineHonoAction } from '@gnosticdev/hono-actions/actions'
import { z } from 'astro/zod'

const myAction = defineHonoAction({
    schema: z.object({
        name: z.string(),
    }),
    handler: async (input) => {
        return {
            message: `Hello ${input.name}!`,
        }
    },
})

const anotherAction = defineHonoAction({
    schema: z.object({
        name2: z.string(),
    }),
    handler: async (input) => {
        return {
            message2: `Hello ${input.name2}!`,
        }
    },
})

export const honoActions = {
    myAction,
    anotherAction,
}
