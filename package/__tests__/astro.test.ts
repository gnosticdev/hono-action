import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('Astro Integration', async () => {
    const TEST_ACTIONS_CONTENT = `import { defineHonoAction } from '@gnosticdev/hono-actions/actions'
    export const honoActions = {action1: defineHonoAction({handler: async () => {return {message: "Hello World"}}})}`
    let tmpDir: string
    let codeGenDir: string

    beforeEach(async () => {
        tmpDir = fs.mkdtempSync(path.join(process.cwd(), 'astro-tmp'))
        fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true })
        fs.writeFileSync(path.join(tmpDir, 'src/hono.ts'), TEST_ACTIONS_CONTENT)
        codeGenDir = path.join(
            tmpDir,
            '.astro',
            'integrations',
            '_gnosticdev_hono-actions',
        )
    })

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true })
        console.log('tmpDir removed', tmpDir)
    })

    it('[astro sync] generates router, client and injects route/types', async () => {
        const { default: integration } = await import('../src/integration')
        const { default: cloudflare } = await import('@astrojs/cloudflare')
        const { sync } = await import('../../node_modules/astro')
        const spy = vi.fn(integration)

        await sync({
            adapter: cloudflare(),
            root: tmpDir,
            output: 'server',
            integrations: [spy()],
            server: { port: 3333 },
        })

        expect(spy).toHaveBeenCalled()

        // // Assert generated files exist
        expect(fs.existsSync(path.join(codeGenDir, 'router.ts'))).toBe(true)
        expect(fs.existsSync(path.join(codeGenDir, 'client.ts'))).toBe(true)
        expect(fs.existsSync(path.join(codeGenDir, 'types.d.ts'))).toBe(true)
        expect(fs.existsSync(path.join(codeGenDir, 'api.ts'))).toBe(true)
    })
})
