import type { User } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

type AuthenticatedContext = {
  supabase: Awaited<ReturnType<typeof createClient>>
  user: User
}

type UnauthenticatedRouteResult = {
  error: string
  details: string
}

function normalizeNextPath(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value

  if (!rawValue || typeof rawValue !== 'string') {
    return '/'
  }

  const trimmed = rawValue.trim()

  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return '/'
  }

  return trimmed
}

export function buildLoginPath(nextPath?: string | string[] | undefined) {
  const safeNextPath = normalizeNextPath(nextPath)
  const params = new URLSearchParams()

  if (safeNextPath !== '/') {
    params.set('next', safeNextPath)
  }

  const query = params.toString()
  return query ? `/login?${query}` : '/login'
}

export async function getAuthenticatedContext(): Promise<AuthenticatedContext | null> {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return null
  }

  return {
    supabase,
    user,
  }
}

export async function requireAuthenticatedPageUser(nextPath?: string) {
  const context = await getAuthenticatedContext()

  if (!context) {
    redirect(buildLoginPath(nextPath))
  }

  return context
}

export async function requireAuthenticatedRouteUser(): Promise<
  AuthenticatedContext | UnauthenticatedRouteResult
> {
  const context = await getAuthenticatedContext()

  if (!context) {
    return {
      error: 'Authentication required.',
      details: 'Sign in with a valid account before calling this route.',
    }
  }

  return context
}

export function isUnauthenticatedRouteResult(
  value: AuthenticatedContext | UnauthenticatedRouteResult
): value is UnauthenticatedRouteResult {
  return 'error' in value
}
