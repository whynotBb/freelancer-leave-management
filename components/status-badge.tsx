import { Badge } from '@/components/ui/badge'

export type RequestStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED'

export const STATUS_LABEL: Record<RequestStatus, string> = {
  DRAFT: '임시저장',
  PENDING: '대기',
  APPROVED: '승인완료',
  REJECTED: '반려',
  CANCELED: '취소',
}

// 같은 타임라인에 연차조정 등 카테고리 태그(components/category-badge.tsx)와 상태 태그가
// 나란히 나올 수 있어, 그 팔레트(emerald/amber/sky/violet/slate/rose)와 겹치지 않는 색을 쓴다.
const STATUS_BADGE_CLASS: Record<RequestStatus, string> = {
  DRAFT: 'border-gray-300 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300',
  PENDING: 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300',
  APPROVED: 'border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300',
  REJECTED: 'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300',
  CANCELED: 'border-stone-300 bg-stone-50 text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300',
}

export function StatusBadge({ status, className }: { status: RequestStatus; className?: string }) {
  return (
    <Badge variant="outline" className={className ? `${STATUS_BADGE_CLASS[status]} ${className}` : STATUS_BADGE_CLASS[status]}>
      {STATUS_LABEL[status]}
    </Badge>
  )
}
