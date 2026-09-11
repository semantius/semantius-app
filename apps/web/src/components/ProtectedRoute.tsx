import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { ApiErrorDisplay } from '@/components/ApiErrorDisplay'
import { hideAppLoader } from '@/lib/appLoader'
import { useT } from '@/i18n'

interface ProtectedRouteProps {
  children: ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const t = useT()
  const {
    token,
    loginInProgress,
    isAuthReady,
    userInfoError,
    rpcUserInfoError,
    userInfoLoading,
    rpcUserInfoLoading
  } = useAuth()

  // No logIn() call here — _app.tsx beforeLoad already redirects unauthenticated
  // users to /login. Calling logIn() here caused a race condition: the library
  // transiently clears loginInProgress before setting the token, so this component
  // would see !token && !loginInProgress and trigger a second OAuth redirect.

  const hasErrors = !userInfoLoading && !rpcUserInfoLoading && (userInfoError || rpcUserInfoError)
  const isReady = token && isAuthReady && !userInfoLoading && !rpcUserInfoLoading && !hasErrors

  // Hide the HTML loading overlay once we have a final state (ready, error, or no token)
  useEffect(() => {
    if (isReady || hasErrors || !token) {
      hideAppLoader()
    }
  }, [isReady, hasErrors, token])

  // While loading (no token yet, or fetching user info), let the HTML overlay stay visible.
  // Return null so there's no flash of a second spinner.
  if (!token) {
    return null
  }

  if (hasErrors) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="max-w-2xl w-full space-y-4">
          {userInfoError && (
            <ApiErrorDisplay
              error={userInfoError}
              title={t('Failed to fetch user information from OAuth provider')}
            />
          )}
          {rpcUserInfoError && (
            <ApiErrorDisplay
              error={rpcUserInfoError}
              title={t('Failed to fetch user information from API')}
            />
          )}
        </div>
      </div>
    )
  }

  if (!isReady) {
    return null
  }

  return <>{children}</>
}
