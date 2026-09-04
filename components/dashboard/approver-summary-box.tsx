import Link from 'next/link'
import { Button } from '@/components/ui/button'

interface ApproverSummaryBoxProps {
  pendingCount: number
  processedCount: number
  assignedFreelancerCount: number
}

export function ApproverSummaryBox({ pendingCount, processedCount, assignedFreelancerCount }: ApproverSummaryBoxProps) {
  return (
    <div className="rounded-lg border p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-medium">내 결재 정보</h2>
        <Button asChild variant="outline" size="sm">
          <Link href="/approvals">결재함으로</Link>
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">결재대기</p>
          <p>{pendingCount}건</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">처리완료</p>
          <p>{processedCount}건</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">담당 프리랜서</p>
          <p>{assignedFreelancerCount}명</p>
        </div>
      </div>
    </div>
  )
}
