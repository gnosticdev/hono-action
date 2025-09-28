/// <reference types="astro/client" />

interface Env {
    TEST_VAR?: string
    ASTRO_LOCALS?: {
        kv: {
            getItem: (key: string) => Promise<any>
            setItem: (key: string, value: any) => Promise<void>
        }
        sessionId: string
    }
}

type Runtime = import('@astrojs/cloudflare').Runtime<Env>

declare namespace App {
    interface Locals extends Runtime {
        db: D1Database
    }
}
