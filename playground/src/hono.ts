import {
    defineHonoAction,
    type HonoEnv,
} from '@gnosticdev/hono-actions/actions'
import { z } from 'astro/zod'
import { Hono } from 'hono'

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
    handler: async (input, ctx) => {
        console.log('anotherAction env', ctx.env)
        return {
            message2: `Hello ${input.name2}!`,
        }
    },
})

const noSchemaAction = defineHonoAction({
    handler: async (input) => {
        return {
            message: `Hello ${input.name}!`,
        }
    },
})

const appSolo = new Hono<HonoEnv>()
appSolo.use('*', async (c, next) => {
    console.log('appSolo env', c.env)
    await next()
})
const getRoute = appSolo.get('/', (c) => {
    return c.json({
        message: 'Hi from a get route',
    })
})

console.log('appSolo', appSolo.routes)

export const honoActions = {
    myAction,
    anotherAction,
    noSchemaAction,
    getRoute,
}
