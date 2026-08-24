import { describe, expect, it } from 'vitest'
import { hasOverlappingActiveRequest } from './leave-validation'

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
