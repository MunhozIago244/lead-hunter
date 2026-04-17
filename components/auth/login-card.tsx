'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import { createClient } from '@/lib/supabase/client'

type LoginCardProps = {
  nextPath: string
}

export function LoginCard({ nextPath }: LoginCardProps) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (error) {
        throw error
      }

      router.replace(nextPath)
      router.refresh()
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Nao foi possivel iniciar a sessao.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="w-full max-w-md rounded-[2rem] border border-border bg-surface p-8 shadow-[0_22px_80px_rgba(17,24,18,0.10)]">
      <div className="space-y-3">
        <p className="inline-flex w-fit items-center rounded-full border border-border bg-surface-strong px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-muted">
          Auth
        </p>
        <h1 className="text-3xl font-semibold tracking-[-0.04em]">
          Entre para acessar o Lead Hunter
        </h1>
        <p className="text-sm leading-6 text-muted">
          Use um usuário interno do Supabase Auth para liberar o radar de leads
          e o workspace CRM.
        </p>
      </div>

      <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
        <label className="grid gap-2">
          <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
            Email
          </span>
          <input
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="voce@empresa.com"
            className="rounded-[1rem] border border-border bg-surface-strong px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </label>

        <label className="grid gap-2">
          <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
            Senha
          </span>
          <input
            required
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Sua senha"
            className="rounded-[1rem] border border-border bg-surface-strong px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </label>

        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center justify-center rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:cursor-wait disabled:opacity-75"
        >
          {isSubmitting ? 'Entrando...' : 'Entrar'}
        </button>
      </form>

      {errorMessage ? (
        <p className="mt-4 rounded-[1.1rem] border border-warning/35 bg-warning/10 px-4 py-3 text-sm leading-6 text-warning">
          {errorMessage}
        </p>
      ) : null}
    </div>
  )
}
