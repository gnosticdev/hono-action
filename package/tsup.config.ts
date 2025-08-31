import { defineConfig } from 'tsup'
import packageJson from './package.json'

export default defineConfig({
  entry: {
    actions: 'src/actions.ts', // Main entry for action definitions
    integration: 'src/index.ts', // Integration entry (Node.js only)
  },
  format: ['esm'],
  dts: true,
  clean: true,
  bundle: true, // Bundle all dependencies except externals
  splitting: false,
  removeNodeProtocol: false,
  sourcemap: false,
  target: 'es2022',
  minify: false,
  external: [...Object.keys(packageJson.peerDependencies || {})],
})
