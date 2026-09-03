import { Badge } from '@/components/ui/badge'

export type HistoryCategory =
  | '연차 자동 발생'
  | '연차 조정'
  | '사용 조정'
  | '사용'
  | '결재자 변경'
  | '입사일 변경'
  | '만근 예외'

// 내 문서(프리랜서)와 프리랜서정보관리(관리자) 양쪽 이력 목록이 같은 색상 체계를 쓰도록 공유한다.
// '사용 조정'은 관리자가 사용량을 직접 조정하는 항목이라 의미가 가까운 '사용'과 같은 색을 쓴다.
export const CATEGORY_BADGE_CLASS: Record<HistoryCategory, string> = {
  '연차 자동 발생': 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  '연차 조정': 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300',
  사용: 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300',
  '사용 조정': 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300',
  '결재자 변경': 'border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300',
  '입사일 변경': 'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300',
  '만근 예외': 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300',
}

export function CategoryBadge({ category, className }: { category: HistoryCategory; className?: string }) {
  return (
    <Badge variant="outline" className={className ? `${CATEGORY_BADGE_CLASS[category]} ${className}` : CATEGORY_BADGE_CLASS[category]}>
      {category}
    </Badge>
  )
}
