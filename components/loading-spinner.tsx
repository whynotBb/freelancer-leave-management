import { cn } from '@/lib/utils'

interface LoadingSpinnerProps {
  label?: string
  className?: string
}

// 데이터 로딩 중 공통으로 쓰는 스피너. 앞으로 만들어지는 화면들은 전부 이 컴포넌트로
// 로딩 상태를 표시한다(개별 화면에서 Loader2Icon을 직접 그리지 않는다).
export function LoadingSpinner({ label = '불러오는 중...', className }: LoadingSpinnerProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 py-16', className)}>
      <div className="size-8 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary" />
      {label && <p className="text-sm text-muted-foreground">{label}</p>}
    </div>
  )
}
