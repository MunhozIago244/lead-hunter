import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { CSRF_COOKIE_NAME } from '@/lib/security-constants'

const PAGE_PATHS_REQUIRING_AUTH = new Set(['/', '/crm'])

function shouldProtectPage(pathname: string) {
  return PAGE_PATHS_REQUIRING_AUTH.has(pathname)
}

function buildLoginPath(nextPath: string) {
  const params = new URLSearchParams()

  if (nextPath && nextPath !== '/') {
    params.set('next', nextPath)
  }

  const query = params.toString()
  return query ? `/login?${query}` : '/login'
}

function shouldSkipMiddleware(pathname: string) {
  return (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname === '/favicon.ico' ||
    pathname.includes('.')
  )
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  if (shouldSkipMiddleware(pathname)) {
    return NextResponse.next()
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!request.cookies.get(CSRF_COOKIE_NAME)?.value) {
    response.cookies.set(CSRF_COOKIE_NAME, crypto.randomUUID(), {
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      httpOnly: false,
    })
  }

  if (pathname === '/login' && user) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  if (shouldProtectPage(pathname) && !user) {
    const nextPath = `${pathname}${search}`
    return NextResponse.redirect(new URL(buildLoginPath(nextPath), request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
}
