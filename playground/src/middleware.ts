import { defineMiddleware } from 'astro:middleware'
import { DatabaseSync } from 'node:sqlite'

export const onRequest = defineMiddleware(async (context, next) => {
    context.locals.db = new DatabaseSync('file::memory:?cache=shared')
    return next()
})
