import { describe, expect, it } from 'vitest'
import { hasOverlappingActiveRequest, isBeyondBackdateLimit } from './leave-validation'

describe('hasOverlappingActiveRequest', () => {
  it('대기/승인 상태 문서와 기간이 겹치면 true', () => {
    const existing = [{ startDate: '2026-08-24', endDate: '2026-08-26', status: 'PENDING' }]
    expect(hasOverlappingActiveRequest(existing, '2026-08-25', '2026-08-27')).toBe(true)
  })

  it('반려/취소/임시저장 상태는 겹쳐도 무시한다', () => {
    const existing = [
      { startDate: '2026-08-24', endDate: '2026-08-26', status: 'REJECTED' },
      { startDate: '2026-08-24', endDate: '2026-08-26', status: 'CANCELED' },
      { startDate: '2026-08-24', endDate: '2026-08-26', status: 'DRAFT' },
    ]
    expect(hasOverlappingActiveRequest(existing, '2026-08-25', '2026-08-27')).toBe(false)
  })

  it('기간이 겹치지 않으면 false', () => {
    const existing = [{ startDate: '2026-08-24', endDate: '2026-08-26', status: 'APPROVED' }]
    expect(hasOverlappingActiveRequest(existing, '2026-08-27', '2026-08-28')).toBe(false)
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
