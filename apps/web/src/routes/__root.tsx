import {
  HeadContent,
  Link,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import appCss from '../styles.css?url'

interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Mastra × TanStack Todo' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  shellComponent: RootDocument,
})

const navLinkClass =
  'rounded-md px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
// TanStack Router appends activeProps.className to className, so this only holds the overrides.
const navLinkActiveProps = {
  className: 'bg-accent-subtle! text-accent-strong!',
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen bg-neutral-50 font-sans text-neutral-900 antialiased">
        <header className="border-b border-neutral-200 bg-white">
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-5 py-4">
            <Link to="/" className="text-sm font-semibold tracking-tight">
              Mastra <span className="text-neutral-400">×</span> TanStack Todo
            </Link>
            <nav className="flex items-center gap-1">
              <Link
                to="/"
                className={navLinkClass}
                activeProps={navLinkActiveProps}
                activeOptions={{ exact: true }}
              >
                New todo
              </Link>
              <Link
                to="/todos"
                className={navLinkClass}
                activeProps={navLinkActiveProps}
              >
                Todos
              </Link>
            </nav>
          </div>
        </header>

        <main className="mx-auto max-w-2xl px-5 py-10">{children}</main>

        <Scripts />
      </body>
    </html>
  )
}
