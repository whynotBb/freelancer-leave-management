import { addMonthsISO, isBeforeDate } from './date-utils'

export type LeaveRequestType = 'FULL' | 'AM_HALF' | 'PM_HALF'

export interface ExistingRequestRange {
  startDate: string
  endDate: string
  status: string
  type: LeaveRequestType
}

const ACTIVE_STATUSES = new Set(['PENDING', 'APPROVED'])

// 연차(FULL)는 하루 전체를 쓰는 유형이라 그날의 반차와도 공존할 수 없어 무조건 충돌로 본다.
// 반차끼리는 같은 유형(오전+오전, 오후+오후)일 때만 충돌이고, 오전 반차와 오후 반차는 같은
// 날짜라도 정상적으로 나눠 신청하는 조합이라 충돌로 보지 않는다.
function typesConflict(a: LeaveRequestType, b: LeaveRequestType): boolean {
  return a === 'FULL' || b === 'FULL' || a === b
}

export function hasConflictingActiveRequest(
  existing: ExistingRequestRange[],
  startDate: string,
  endDate: string,
  type: LeaveRequestType
): boolean {
  return existing
    .filter((r) => ACTIVE_STATUSES.has(r.status))
    .some((r) => r.startDate <= endDate && startDate <= r.endDate && typesConflict(r.type, type))
}

// 결재가 늦게 올라오는 경우를 감안해 과거 날짜 신청 자체는 허용하되, 너무 오래 지난 신청까지
// 무제한으로 받으면 결재 시점에 실제 근태와 대조하기 어려워진다 — 기준일로부터 1개월 전까지만
// 제출을 허용한다.
export function isBeyondBackdateLimit(startDate: string, asOfDate: string): boolean {
  const earliestAllowed = addMonthsISO(asOfDate, -1)
  return isBeforeDate(startDate, earliestAllowed)
}
