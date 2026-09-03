import { addMonthsISO, isBeforeDate } from './date-utils'

export interface ExistingRequestRange {
  startDate: string
  endDate: string
  status: string
}

const ACTIVE_STATUSES = new Set(['PENDING', 'APPROVED'])

export function hasOverlappingActiveRequest(
  existing: ExistingRequestRange[],
  startDate: string,
  endDate: string
): boolean {
  return existing
    .filter((r) => ACTIVE_STATUSES.has(r.status))
    .some((r) => r.startDate <= endDate && startDate <= r.endDate)
}

// 결재가 늦게 올라오는 경우를 감안해 과거 날짜 신청 자체는 허용하되, 너무 오래 지난 신청까지
// 무제한으로 받으면 결재 시점에 실제 근태와 대조하기 어려워진다 — 기준일로부터 1개월 전까지만
// 제출을 허용한다.
export function isBeyondBackdateLimit(startDate: string, asOfDate: string): boolean {
  const earliestAllowed = addMonthsISO(asOfDate, -1)
  return isBeforeDate(startDate, earliestAllowed)
}
