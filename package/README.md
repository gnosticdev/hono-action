# Astro Actions with Hono and Valibot

Define server actions with built-in validation, error handling, and a pre-built hono client for calling the routes.

## Installation

```bash
npm install @gnosticdev/hono-actions
# or
pnpm add @gnosticdev/hono-actions
# or
bun add @gnosticdev/hono-actions
```

## Requirements

This package requires:

- `astro`: ^5.13.3

All other dependencies (`hono`, `valibot`, `@hono/valibot-validator`, etc.) are bundled with the integration.

## Setup

### 1. Add the integration to your Astro config

```typescript
// astro.config.ts
import { defineConfig } from 'astro/config'
import honoActions from '@gnosticdev/hono-actions/integration'

export default defineConfig({
  integrations: [
    honoActions({
      basePath: '/api', // Optional: default is '/api'
      actionsPath: 'src/server/actions.ts' // Optional: custom path to your actions file
    })
  ]
})
```

### 2. Create your actions file

Create a file at one of these locations (the integration will auto-discover):

- `src/server/actions.ts`
- `src/hono/actions.ts`
- `src/hono/index.ts`
- `src/hono.ts`

## Usage

```typescript
// src/server/actions.ts
import { defineHonoAction, HonoActionError } from '@gnosticdev/hono-actions'
import * as v from 'valibot'

// Define a simple action
export const simpleAction = defineHonoAction({
  path: '/simple',
  schema: v.object({
    name: v.string()
  }),
  handler: async (input, ctx) => {
    // input is automatically typed based on schema
    return { message: `Hello ${input.name}!` }
  }
})

// Define an action with validation
export const validatedAction = defineHonoAction({
  path: '/validated',
  schema: v.object({
    name: v.string(),
    email: v.pipe(v.string(), v.email())
  }),
  handler: async (input, ctx) => {
    // input is automatically typed based on schema
    return {
      message: `Hello ${input.name}!`,
      email: input.email
    }
  }
})

// Use custom error handling
export const errorAction = defineHonoAction({
  path: '/error',
  handler: async (input, ctx) => {
    if (someCondition) {
      throw new HonoActionError({
        message: 'Custom error message',
        code: 'EXTERNAL_API_ERROR'
      })
    }
    return { success: true }
  }
})

// Export all actions in a honoActions object
export const honoActions = {
  simpleAction,
  validatedAction,
  errorAction
}
```

### 3. Use actions in your Astro components or pages

```typescript
// src/pages/example.astro or any .astro file
---
import { honoClient } from '@gnosticdev/hono-actions/client'

const response = await honoClient.simpleAction.$post({
  json: { name: 'John' }
})

let result = null
if (response.ok) {
  result = await response.json() // { message: 'Hello John!' }
} else {
  console.error(await response.text()) // Error message
}
---

<div>
  {result && <p>{result.message}</p>}
</div>
```

### 4. Use in client-side JavaScript

```typescript
// In a client-side script or component
import { honoClient } from '@gnosticdev/hono-actions/client'

// Make requests from the browser
const handleSubmit = async (formData: FormData) => {
  const response = await honoClient.validatedAction.$post({
    json: {
      name: formData.get('name') as string,
      email: formData.get('email') as string
    }
  })

  if (response.ok) {
    const result = await response.json()
    console.log('Success:', result)
  } else {
    const error = await response.text()
    console.error('Error:', error)
  }
}
```

## Package Structure

This package provides two main entry points:

- **`@gnosticdev/hono-actions`** (default): Action definition utilities (`defineHonoAction`, `HonoActionError`, types)
  - Safe for browser environments
  - Used in your action files and client-side code
- **`@gnosticdev/hono-actions/integration`**: Astro integration
  - Uses Node.js built-ins (fs, path)
  - Only used in `astro.config.ts`

## Configuration Options

The integration accepts the following options:

- **`basePath`** (optional): The base path for your API routes. Default: `'/api'`
- **`actionsPath`** (optional): Custom path to your actions file if not using auto-discovery

## Features

- ✅ **Type-safe**: Full TypeScript support with automatic type inference
- ✅ **Validation**: Built-in request validation using Valibot schemas
- ✅ **Error handling**: Custom error types and automatic error responses
- ✅ **Auto-discovery**: Automatically finds your actions file
- ✅ **Client generation**: Pre-built client with full type safety
- ✅ **Development**: Hot reload support during development

## Troubleshooting

### Actions not found

If you get an error that no actions were found, make sure:

1. Your actions file is in one of the supported locations
2. You export a `honoActions` object containing your actions
3. The file path matches the `actionsPath` option if you specified one

### Type errors

If you're getting TypeScript errors:

1. Make sure all peer dependencies are installed
2. Run `astro sync` to regenerate types
3. Restart your TypeScript server in your editor

### Module resolution errors

If you get module resolution errors during development:

1. Try clearing your node_modules and reinstalling
2. Make sure you're using compatible versions of the peer dependencies

## License

MIT
