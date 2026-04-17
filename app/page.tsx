import { requireAuthenticatedPageUser } from '@/lib/auth'

import { LeadListDashboard } from '@/components/dashboard/lead-list-dashboard'

export default async function Home() {
  await requireAuthenticatedPageUser('/')

  return <LeadListDashboard />
}
