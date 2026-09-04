import { ApproverSummaryBox } from '@/components/dashboard/approver-summary-box'

interface ApproverDashboardProps {
  pendingCount: number
  processedCount: number
  assignedFreelancerCount: number
}

export function ApproverDashboard(props: ApproverDashboardProps) {
  return <ApproverSummaryBox {...props} />
}
