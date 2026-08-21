import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { nitro } from 'nitro/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Nitro produces `.output/server/index.mjs`, a plain Node server that reads PORT.
// That is what `bun run start` runs, and what Rock8Cloud runs in production.
//
// The preset is pinned on purpose. Nitro otherwise sniffs the *build* runtime and
// would emit a Bun-targeted server when the build happens to run under Bun (as it
// does inside the `oven/bun` build image), producing an artifact that crashes with
// `ReferenceError: Bun is not defined` under Node. Pinning it means the same
// bundle comes out of every machine and every CI image.
export default defineConfig({
  plugins: [
    nitro({ preset: 'node-server' }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})
