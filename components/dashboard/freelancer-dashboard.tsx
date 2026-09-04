import Link from 'next/link'
import { Button } from '@/components/ui/button'

interface FreelancerDashboardProps {
  granted: number
  used: number
  remaining: number
  pendingCount: number
}

export function FreelancerDashboard({ granted, used, remaining, pendingCount }: FreelancerDashboardProps) {
  return (
    <div className="rounded-lg border p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-medium">내 휴가 정보</h2>
        <Button asChild variant="outline" size="sm">
          <Link href="/documents">내 문서로</Link>
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <p className="text-xs text-muted-foreground">발생</p>
          <p>{granted}일</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">사용</p>
          <p>{used}일</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">잔여</p>
          <p className={remaining < 0 ? 'text-destructive' : undefined}>{remaining}일</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">결재대기</p>
          <p>{pendingCount}건</p>
        </div>
      </div>
    </div>
  )
}
