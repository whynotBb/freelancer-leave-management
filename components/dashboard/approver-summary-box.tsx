import Link from 'next/link'
import { InboxIcon, CheckCircle2Icon, UsersIcon, ArrowRightIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface ApproverSummaryBoxProps {
  pendingCount: number
  processedCount: number
  assignedFreelancerCount: number
}

export function ApproverSummaryBox({ pendingCount, processedCount, assignedFreelancerCount }: ApproverSummaryBoxProps) {
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">내 결재 현황</h2>
          <Button asChild variant="outline" size="sm" className="shrink-0 gap-1.5">
            <Link href="/approvals">
              결재함 바로가기 <ArrowRightIcon className="size-3.5" />
            </Link>
          </Button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">담당 프리랜서의 휴가 신청 및 결재 처리 현황입니다.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* 결재 대기 */}
        <Card
          className={cn(
            'relative overflow-hidden transition-all hover:shadow-md',
            pendingCount > 0 && 'border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20'
          )}
        >
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">결재 대기</span>
              <div
                className={cn(
                  'rounded-md p-2',
                  pendingCount > 0 ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'bg-muted text-muted-foreground'
                )}
              >
                <InboxIcon className="size-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-1">
              <span
                className={cn(
                  'text-3xl font-bold tracking-tight',
                  pendingCount > 0 && 'text-amber-600 dark:text-amber-400'
                )}
              >
                {pendingCount}
              </span>
              <span className="text-sm text-muted-foreground">건</span>
            </div>
          </CardContent>
        </Card>

        {/* 처리 완료 */}
        <Card className="relative overflow-hidden transition-all hover:shadow-md">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">처리 완료</span>
              <div className="rounded-md bg-muted p-2 text-muted-foreground">
                <CheckCircle2Icon className="size-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-3xl font-bold tracking-tight">{processedCount}</span>
              <span className="text-sm text-muted-foreground">건</span>
            </div>
          </CardContent>
        </Card>

        {/* 담당 프리랜서 */}
        <Card className="relative overflow-hidden transition-all hover:shadow-md">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">담당 프리랜서</span>
              <div className="rounded-md bg-primary/10 p-2 text-primary">
                <UsersIcon className="size-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-3xl font-bold tracking-tight">{assignedFreelancerCount}</span>
              <span className="text-sm text-muted-foreground">명</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
