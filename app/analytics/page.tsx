import { requireAuthenticatedPageUser } from '@/lib/auth'

import { AnalyticsDashboard } from '@/components/dashboard/analytics-dashboard'

export default async function AnalyticsPage() {
  await requireAuthenticatedPageUser('/analytics')

  return <AnalyticsDashboard />
}
