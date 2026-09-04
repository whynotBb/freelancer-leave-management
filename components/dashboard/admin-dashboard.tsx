import Link from 'next/link'
import { ApproverSummaryBox } from '@/components/dashboard/approver-summary-box'

interface AdminDashboardProps {
  activeFreelancerCount: number
  approverCount: number
  pendingSignupCount: number
  approver: { pendingCount: number; processedCount: number; assignedFreelancerCount: number } | null
}

export function AdminDashboard({
  activeFreelancerCount,
  approverCount,
  pendingSignupCount,
  approver,
}: AdminDashboardProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-4">
        <h2 className="mb-3 font-medium">전체 현황</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">재직 프리랜서</p>
            <p>{activeFreelancerCount}명</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">결재자</p>
            <p>{approverCount}명</p>
          </div>
        </div>
      </div>
      {pendingSignupCount > 0 && (
        <Link
          href="/admin/users-manage"
          className="flex items-center justify-between rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:hover:bg-amber-900"
        >
          <span>가입 승인 대기 {pendingSignupCount}건</span>
          <span>→</span>
        </Link>
      )}
      {approver && <ApproverSummaryBox {...approver} />}
    </div>
  )
}
