import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '@/lib/security-constants'

function readCookieValue(name: string) {
  if (typeof document === 'undefined') {
    return null
  }

  const cookiePrefix = `${name}=`
  const cookie = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(cookiePrefix))

  if (!cookie) {
    return null
  }

  return decodeURIComponent(cookie.slice(cookiePrefix.length))
}

export function buildBrowserMutationHeaders(init?: HeadersInit) {
  const headers = new Headers(init)
  const csrfToken = readCookieValue(CSRF_COOKIE_NAME)

  if (csrfToken) {
    headers.set(CSRF_HEADER_NAME, csrfToken)
  }

  return headers
}
