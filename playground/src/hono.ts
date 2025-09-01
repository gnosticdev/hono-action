import { defineHonoAction } from '@gnosticdev/hono-actions/actions'
import * as v from 'valibot'

export const myAction = defineHonoAction({
    path: '/myAction',
    schema: v.object({
        name: v.string(),
    }),
    handler: async (input, ctx) => {
        return {
            message: `Hello ${input.name}!`,
        }
    },
})

export const honoActions = {
    myAction,
}
