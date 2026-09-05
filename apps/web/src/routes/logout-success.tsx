import { createFileRoute } from '@tanstack/react-router'
import { pageTitle } from '@/lib/pageTitle'
import { LogoutConfirmationPage } from '@/components/LogoutConfirmationPage'

export const Route = createFileRoute('/logout-success')({
  head: () => ({ meta: [{ title: pageTitle('Signed out') }] }),
  // This is a public page that should be accessible even when logged out
  // Don't trigger auto-login on this page
  beforeLoad: () => {
    // Allow this page to render without authentication
    return
  },
  component: LogoutConfirmationPage,
})