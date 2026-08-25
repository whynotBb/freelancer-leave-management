export function calculateAdjustmentDelta(currentTotal: number, newTotal: number): number {
  return Math.round((newTotal - currentTotal) * 10) / 10
}

export interface GrantAdjustmentRow {
  userId: number
  grantDate: string
  amount: number
  cycleEnd: string
  expired: false
  note: string
  createdBy: number
}

export function buildGrantAdjustmentRow(params: {
  userId: number
  currentGranted: number
  newGranted: number
  today: string
  cycleEnd: string
  reason: string
  createdBy: number
}): GrantAdjustmentRow | null {
  const amount = calculateAdjustmentDelta(params.currentGranted, params.newGranted)
  if (amount === 0) return null
  return {
    userId: params.userId,
    grantDate: params.today,
    amount,
    cycleEnd: params.cycleEnd,
    expired: false,
    note: params.reason,
    createdBy: params.createdBy,
  }
}

// type: 'ADJUSTMENT' 행은 실제 휴가 신청이 아니다. 향후 hasOverlappingActiveRequest(휴가 신청
// 중복 검사)나 isFullAttendance(만근 판정)에 leaveRequests 데이터를 넘기는 코드를 새로 작성할 때는
// 이 타입의 행을 반드시 제외하고 넘겨야 한다 — 두 함수 모두 이미 필터링된 배열을 받는 순수 함수라
// 이 필터링은 호출부의 책임이다.
export interface UsageAdjustmentRow {
  userId: number
  approverId: number
  title: string
  startDate: string
  endDate: string
  type: 'ADJUSTMENT'
  requestedDays: number
  reason: string
  status: 'APPROVED'
}

export function buildHireDateChangeMarkerRow(params: {
  userId: number
  today: string
  cycleEnd: string
  reason: string
  createdBy: number
}): GrantAdjustmentRow {
  return {
    userId: params.userId,
    grantDate: params.today,
    amount: 0,
    cycleEnd: params.cycleEnd,
    expired: false,
    note: params.reason,
    createdBy: params.createdBy,
  }
}

export function buildUsageAdjustmentRow(params: {
  userId: number
  currentUsed: number
  newUsed: number
  today: string
  reason: string
  approverId: number
}): UsageAdjustmentRow | null {
  const requestedDays = calculateAdjustmentDelta(params.currentUsed, params.newUsed)
  if (requestedDays === 0) return null
  return {
    userId: params.userId,
    approverId: params.approverId,
    title: '연차 사용 수동 조정',
    startDate: params.today,
    endDate: params.today,
    type: 'ADJUSTMENT',
    requestedDays,
    reason: params.reason,
    status: 'APPROVED',
  }
}
