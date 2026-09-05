import { useNavigate } from '@tanstack/react-router'
import { useAuth } from '@/hooks/useAuth'
import { getApiConfig, createApiHeaders } from '@/lib/apiClient'
import { moduleHomePath } from '@/lib/moduleHome'

/**
 * Hook that returns a function to navigate to a module's home page.
 * When a module's home_page is empty or "/", it navigates to the module slug.
 */
export function useModuleNavigate() {
  const navigate = useNavigate()
  const { token } = useAuth()
  // `token` is kept for the commented-out first-entity fallback below.
  void token

  return async (options: {
    homePage?: string
    moduleId?: number
    moduleName: string
    moduleSlug: string
  }) => {
    // Destination logic lives in lib/moduleHome so the module tiles can render
    // the same target as a real <Link href>; see moduleHomePath.
    navigate({ to: moduleHomePath({ home_page: options.homePage, module_slug: options.moduleSlug }) })
  }
}
