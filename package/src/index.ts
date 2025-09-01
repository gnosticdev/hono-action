/// <reference types="astro/client" />

import {
    addVirtualImports,
    createResolver,
    defineIntegration,
} from 'astro-integration-kit'
import { z } from 'astro/zod'
import fs from 'node:fs/promises'
import path from 'node:path'
import { glob } from 'tinyglobby'

import {
    generateRouter,
    getAstroHandler,
    getHonoClient,
} from './integration-files.js'
import { reservedRoutes } from './lib/utils.js'

const optionsSchema = z
    .object({
        basePath: z.string().optional(),
        actionsPath: z.string().optional(),
    })
    .optional()

export type IntegrationOptions = z.infer<typeof optionsSchema>

const VIRTUAL_MODULE_ID_CLIENT = '@gnosticdev/hono-actions/client'
// const VIRTUAL_MODULE_ID_DEFINITION = 'virtual:hono-actions'
const VIRTUAL_MODULE_ID_ROUTER = 'virtual:hono-actions/router'

const ACTION_PATTERNS = [
    'src/server/actions.ts',
    'src/hono/actions.ts',
    'src/hono/index.ts',
    'src/hono.ts',
]

/**
 * Astro integration for Hono Actions
 *
 * This integration automatically discovers action files in your project,
 * generates type-safe client code, and sets up API routes.
 *
 * @param options - Configuration options for the integration
 * @param options.basePath - Base path for API routes (default: '/api')
 * @param options.actionsPath - Custom path to actions file (optional, auto-discovered by default)
 */
export default defineIntegration({
    name: '@gnosticdev/hono-actions',
    optionsSchema,
    setup: ({ options = {}, name }) => {
        const basePath = options.basePath ?? '/api'
        if (reservedRoutes.includes(basePath)) {
            throw new Error(
                `Base path ${basePath} is reserved by Astro; pick another (e.g. /api2).`,
            )
        }

        createResolver(import.meta.url)

        return {
            name,
            hooks: {
                'astro:config:setup': async (params) => {
                    const { logger, injectRoute, createCodegenDir, config } =
                        params
                    const root = config.root.pathname

                    // the definition is available via the export
                    // 1) Make the definition module available immediately
                    // const resolvedDefinitionPath = resolve('./define-action.ts')
                    // addVirtualImports(params, {
                    //     name,
                    //     imports: {
                    //         [VIRTUAL_MODULE_ID_DEFINITION]: `export * from '${resolvedDefinitionPath}';`
                    //     }
                    // })

                    // 2) Discover user's actions file(s) in the CONSUMER project
                    const files = await glob(ACTION_PATTERNS, {
                        cwd: root,
                        expandDirectories: false,
                        absolute: true,
                    })
                    const actionsPath = options.actionsPath ?? files[0] // only need the first file
                    if (!actionsPath) {
                        throw new Error(
                            `No actions found. Create one of:\n${ACTION_PATTERNS.map((p) => ` - ${p}`).join('\n')}`,
                        )
                    }

                    const resolvedActionsPath = path.isAbsolute(actionsPath)
                        ? actionsPath
                        : path.join(root, actionsPath)

                    params.addWatchFile(resolvedActionsPath)

                    logger.info(
                        `Found actions: ${path.relative(root, resolvedActionsPath)}`,
                    )

                    // 3) Generate router that lazy-imports the user's actions at runtime
                    const codeGenDir = createCodegenDir()
                    const routerPathAbs = path.join(
                        codeGenDir.pathname,
                        'router.ts',
                    )

                    // dont need it to start with a / with fast-glob
                    const relFromGenToActions = path
                        .relative(codeGenDir.pathname, resolvedActionsPath)
                        .split(path.sep)
                        .join('/')

                    const routerContent = generateRouter({
                        basePath,
                        relativeActionsPath: relFromGenToActions,
                    })

                    await fs.writeFile(routerPathAbs, routerContent, 'utf-8')

                    // 4) Generate API handler (adapter-specific)
                    const astroHandlerPathAbs = path.join(
                        codeGenDir.pathname,
                        'api.ts',
                    )
                    if (!params.config.adapter?.name)
                        throw new Error('No Astro adapter found')
                    const astroHandlerContent = getAstroHandler('cloudflare') // or pick via adapter name
                    await fs.writeFile(
                        astroHandlerPathAbs,
                        astroHandlerContent,
                        'utf-8',
                    )

                    // 5) Generate client and wire virtual ids
                    const clientPathAbs = path.join(
                        codeGenDir.pathname,
                        'client.ts',
                    )
                    const clientContent = getHonoClient(
                        config.server.port,
                        config.site,
                    )
                    await fs.writeFile(clientPathAbs, clientContent, 'utf-8')

                    addVirtualImports(params, {
                        name,
                        imports: {
                            [VIRTUAL_MODULE_ID_CLIENT]: `export * from '${clientPathAbs}';`,
                            [VIRTUAL_MODULE_ID_ROUTER]: `export * from '${routerPathAbs}';`,
                        },
                    })

                    logger.info('✅ Hono Actions virtual imports added')

                    // 6) Inject API route
                    injectRoute({
                        pattern: `${basePath}/[...slug]`,
                        entrypoint: astroHandlerPathAbs,
                        prerender: false,
                    })

                    logger.info(
                        `✅ Hono Actions route mounted at ${basePath}/[...slug]`,
                    )
                },

                'astro:config:done': async ({ injectTypes }) => {
                    // augment env/types without clobbering package exports
                    injectTypes({
                        filename: 'actions.d.ts',
                        content: `
  declare module '@gnosticdev/hono-actions/actions' {
    interface Bindings extends Env { ASTRO_LOCALS: App.Locals }
    interface HonoEnv { Bindings: Bindings }
  }
  export {}
  `,
                    })

                    injectTypes({
                        filename: 'types.d.ts',
                        content: `
  // Generated by Hono Actions Integration

  declare module 'virtual:hono-actions/router' {
    export type HonoRouter = import('./router.ts').HonoRouter
    const app: typeof import('./router.ts').default
    export default app
  }

  declare module '@gnosticdev/hono-actions/client' {
    export const honoClient: typeof import('./client').honoClient
  }
  `,
                    })
                },
            },
        }
    },
})
