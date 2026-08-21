import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * The form and the list used to be two pages. They are one page now, at `/`.
 * The route stays as a redirect so old links and bookmarks keep working.
 */
export const Route = createFileRoute('/todos')({
  beforeLoad: () => {
    throw redirect({ to: '/' })
  },
})
