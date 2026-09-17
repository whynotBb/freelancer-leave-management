import Link from 'next/link'
import { CalendarIcon, CheckCircle2Icon, ClockIcon, ArrowRightIcon, SparklesIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface FreelancerDashboardProps {
  granted: number
  used: number
  remaining: number
  pendingCount: number
}

export function FreelancerDashboard({ granted, used, remaining, pendingCount }: FreelancerDashboardProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">내 휴가 현황</h2>
          <p className="text-sm text-muted-foreground">올해 발생 및 사용한 연차 이력을 한눈에 확인합니다.</p>
        </div>
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link href="/documents">
            내 문서 전체보기 <ArrowRightIcon className="size-3.5" />
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* 발생 연차 */}
        <Card className="relative overflow-hidden transition-all hover:shadow-md">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">발생 연차</span>
              <div className="rounded-md bg-primary/10 p-2 text-primary">
                <CalendarIcon className="size-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-3xl font-bold tracking-tight">{granted}</span>
              <span className="text-sm text-muted-foreground">일</span>
            </div>
          </CardContent>
        </Card>

        {/* 사용 연차 */}
        <Card className="relative overflow-hidden transition-all hover:shadow-md">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">사용 연차</span>
              <div className="rounded-md bg-muted p-2 text-muted-foreground">
                <CheckCircle2Icon className="size-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-3xl font-bold tracking-tight">{used}</span>
              <span className="text-sm text-muted-foreground">일</span>
            </div>
          </CardContent>
        </Card>

        {/* 잔여 연차 */}
        <Card
          className={cn(
            'relative overflow-hidden transition-all hover:shadow-md',
            remaining < 0 ? 'border-destructive/30 bg-destructive/5' : 'border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-950/20'
          )}
        >
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">잔여 연차</span>
              <div
                className={cn(
                  'rounded-md p-2',
                  remaining < 0 ? 'bg-destructive/10 text-destructive' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                )}
              >
                <SparklesIcon className="size-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-1">
              <span
                className={cn(
                  'text-3xl font-bold tracking-tight',
                  remaining < 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'
                )}
              >
                {remaining}
              </span>
              <span className="text-sm text-muted-foreground">일</span>
            </div>
          </CardContent>
        </Card>

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
                <ClockIcon className="size-4" />
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
      </div>
    </div>
  )
}
