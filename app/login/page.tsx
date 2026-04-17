import { redirect } from 'next/navigation'

import { LoginCard } from '@/components/auth/login-card'
import { getAuthenticatedContext } from '@/lib/auth'

type LoginPageProps = {
  searchParams: Promise<{
    next?: string | string[]
  }>
}

function normalizeNextPath(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value

  if (!rawValue || typeof rawValue !== 'string') {
    return '/'
  }

  if (!rawValue.startsWith('/') || rawValue.startsWith('//')) {
    return '/'
  }

  return rawValue
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const context = await getAuthenticatedContext()

  if (context) {
    redirect('/')
  }

  const params = await searchParams
  const nextPath = normalizeNextPath(params.next)

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-6 py-12 sm:px-10">
      <LoginCard nextPath={nextPath} />
    </main>
  )
}
