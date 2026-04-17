import { NextResponse } from 'next/server'

function withNoStore(init?: ResponseInit): ResponseInit {
  const headers = new Headers(init?.headers)
  headers.set('Cache-Control', 'no-store')

  return {
    ...init,
    headers,
  }
}

export function apiJson<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, withNoStore(init))
}

export function apiError(status: number, error: string, details?: string) {
  return apiJson(details ? { error, details } : { error }, { status })
}
