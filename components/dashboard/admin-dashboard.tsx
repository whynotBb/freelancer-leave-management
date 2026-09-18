import Link from 'next/link'
import { UsersIcon, ShieldCheckIcon, UserPlusIcon, ArrowRightIcon, AlertCircleIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
    <div className="space-y-8">
      {/* 가입 승인 대기 배너 */}
      {pendingSignupCount > 0 && (
        <div className="flex flex-col items-end gap-3 rounded-lg border border-amber-300/60 bg-amber-50/80 p-4 lg:flex-row lg:items-center lg:justify-between dark:border-amber-800/60 dark:bg-amber-950/40">
          <div className="flex w-full items-start gap-3 lg:w-auto">
            <div className="shrink-0 rounded-full bg-amber-500/20 p-2 text-amber-600 dark:text-amber-400">
              <AlertCircleIcon className="size-5" />
            </div>
            <div>
              <p className="font-semibold text-amber-900 dark:text-amber-200">
                신규 가입 승인 대기 문서가 {pendingSignupCount}건 있습니다.
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400">
                새로 가입을 신청한 프리랜서의 승인 처리를 진행해 주세요.
              </p>
            </div>
          </div>
          <Button asChild size="sm" className="bg-amber-600 text-white hover:bg-amber-700 lg:shrink-0">
            <Link href="/admin/users-manage" className="gap-1.5">
              사용자 관리로 이동 <ArrowRightIcon className="size-3.5" />
            </Link>
          </Button>
        </div>
      )}

      {/* 시스템 전체 현황 */}
      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight">시스템 전체 현황</h2>
            <Button asChild variant="outline" size="sm" className="shrink-0 gap-1.5">
              <Link href="/admin/users-manage">
                사용자 관리 <ArrowRightIcon className="size-3.5" />
              </Link>
            </Button>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">현재 시스템에 등록된 전체 사용자 현황입니다.</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* 재직 프리랜서 */}
          <Card className="relative overflow-hidden transition-all hover:shadow-md">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">재직 프리랜서</span>
                <div className="rounded-md bg-primary/10 p-2 text-primary">
                  <UsersIcon className="size-4" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-3xl font-bold tracking-tight">{activeFreelancerCount}</span>
                <span className="text-sm text-muted-foreground">명</span>
              </div>
            </CardContent>
          </Card>

          {/* 결재자 */}
          <Card className="relative overflow-hidden transition-all hover:shadow-md">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">결재자 인원</span>
                <div className="rounded-md bg-indigo-500/10 p-2 text-indigo-600 dark:text-indigo-400">
                  <ShieldCheckIcon className="size-4" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-3xl font-bold tracking-tight">{approverCount}</span>
                <span className="text-sm text-muted-foreground">명</span>
              </div>
            </CardContent>
          </Card>

          {/* 가입 대기 */}
          <Card className="relative overflow-hidden transition-all hover:shadow-md">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">가입 승인 대기</span>
                <div className="rounded-md bg-amber-500/10 p-2 text-amber-600 dark:text-amber-400">
                  <UserPlusIcon className="size-4" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-3xl font-bold tracking-tight">{pendingSignupCount}</span>
                <span className="text-sm text-muted-foreground">건</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 겸직 결재자 정보 */}
      {approver && (
        <div className="pt-2">
          <ApproverSummaryBox {...approver} />
        </div>
      )}
    </div>
  )
}
