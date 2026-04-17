import { CrmWorkspace } from '@/components/crm/crm-workspace'
import { requireAuthenticatedPageUser } from '@/lib/auth'
import { getCrmWorkspaceData } from '@/lib/crm-workspace'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export default async function CrmPage() {
  try {
    await requireAuthenticatedPageUser('/crm')
    const supabase = createAdminClient()
    const data = await getCrmWorkspaceData(supabase)

    return <CrmWorkspace initialData={data} />
  } catch (error) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-4xl items-center justify-center px-6 py-12 text-center sm:px-10">
        <div className="rounded-[2rem] border border-border bg-surface p-10 shadow-[0_22px_80px_rgba(17,24,18,0.10)]">
          <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted">
            CRM Workspace
          </p>
          <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em]">
            Não foi possível carregar o CRM
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-muted sm:text-base">
            {error instanceof Error
              ? error.message
              : 'Falha inesperada ao inicializar a página do CRM.'}
          </p>
        </div>
      </main>
    )
  }
}
