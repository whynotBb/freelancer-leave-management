import { describe, expect, it } from 'vitest'
import { hasConflictingActiveRequest, isBeyondBackdateLimit } from './leave-validation'

describe('hasConflictingActiveRequest', () => {
  it('대기/승인 상태의 같은 유형 문서와 기간이 겹치면 true', () => {
    const existing = [{ startDate: '2026-08-24', endDate: '2026-08-26', status: 'PENDING', type: 'FULL' as const }]
    expect(hasConflictingActiveRequest(existing, '2026-08-25', '2026-08-27', 'FULL')).toBe(true)
  })

  it('반려/취소/임시저장 상태는 겹쳐도 무시한다', () => {
    const existing = [
      { startDate: '2026-08-24', endDate: '2026-08-26', status: 'REJECTED', type: 'FULL' as const },
      { startDate: '2026-08-24', endDate: '2026-08-26', status: 'CANCELED', type: 'FULL' as const },
      { startDate: '2026-08-24', endDate: '2026-08-26', status: 'DRAFT', type: 'FULL' as const },
    ]
    expect(hasConflictingActiveRequest(existing, '2026-08-25', '2026-08-27', 'FULL')).toBe(false)
  })

  it('기간이 겹치지 않으면 false', () => {
    const existing = [{ startDate: '2026-08-24', endDate: '2026-08-26', status: 'APPROVED', type: 'FULL' as const }]
    expect(hasConflictingActiveRequest(existing, '2026-08-27', '2026-08-28', 'FULL')).toBe(false)
  })

  it('같은 날짜라도 오전 반차끼리 겹치면 true', () => {
    const existing = [{ startDate: '2026-08-24', endDate: '2026-08-24', status: 'PENDING', type: 'AM_HALF' as const }]
    expect(hasConflictingActiveRequest(existing, '2026-08-24', '2026-08-24', 'AM_HALF')).toBe(true)
  })

  it('같은 날짜라도 오후 반차끼리 겹치면 true', () => {
    const existing = [{ startDate: '2026-08-24', endDate: '2026-08-24', status: 'APPROVED', type: 'PM_HALF' as const }]
    expect(hasConflictingActiveRequest(existing, '2026-08-24', '2026-08-24', 'PM_HALF')).toBe(true)
  })

  it('같은 날짜의 오전 반차와 오후 반차는 서로 겹치지 않는다', () => {
    const existing = [{ startDate: '2026-08-24', endDate: '2026-08-24', status: 'PENDING', type: 'AM_HALF' as const }]
    expect(hasConflictingActiveRequest(existing, '2026-08-24', '2026-08-24', 'PM_HALF')).toBe(false)
  })

  it('기존이 연차(FULL)면 반차와 겹쳐도 차단된다', () => {
    const existing = [{ startDate: '2026-08-24', endDate: '2026-08-26', status: 'PENDING', type: 'FULL' as const }]
    expect(hasConflictingActiveRequest(existing, '2026-08-25', '2026-08-25', 'AM_HALF')).toBe(true)
  })

  it('새 신청이 연차(FULL)면 기존 반차와 겹쳐도 차단된다', () => {
    const existing = [{ startDate: '2026-08-25', endDate: '2026-08-25', status: 'APPROVED', type: 'PM_HALF' as const }]
    expect(hasConflictingActiveRequest(existing, '2026-08-24', '2026-08-26', 'FULL')).toBe(true)
  })
})

describe('isBeyondBackdateLimit', () => {
  it('정확히 1개월 전 날짜는 허용된다', () => {
    expect(isBeyondBackdateLimit('2026-08-03', '2026-09-03')).toBe(false)
  })

  it('1개월 전보다 하루라도 이르면 차단된다', () => {
    expect(isBeyondBackdateLimit('2026-08-02', '2026-09-03')).toBe(true)
  })

  it('오늘 또는 미래 날짜는 허용된다', () => {
    expect(isBeyondBackdateLimit('2026-09-03', '2026-09-03')).toBe(false)
    expect(isBeyondBackdateLimit('2026-12-01', '2026-09-03')).toBe(false)
  })
})
