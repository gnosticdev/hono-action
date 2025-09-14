import { defineHonoAction } from '@gnosticdev/hono-actions/actions'
import { z } from 'astro/zod'

export const myAction = defineHonoAction({
    schema: z.object({
        name: z.string(),
    }),
    handler: async (input) => {
        return {
            message: `Hello ${input.name}!`,
        }
    },
})

export const honoActions = {
    myAction,
}
