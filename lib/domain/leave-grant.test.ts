import { describe, expect, it } from 'vitest'
import { isFullAttendance } from './leave-grant'

describe('isFullAttendance', () => {
  it('해당 평가월에 승인된 전일 연차가 없으면 만근', () => {
    expect(isFullAttendance('2026-03-15', 1, [])).toBe(true)
  })

  it('평가월 내부에 전일 연차가 있으면 만근 아님', () => {
    const periods = [{ startDate: '2026-03-20', endDate: '2026-03-21' }]
    expect(isFullAttendance('2026-03-15', 1, periods)).toBe(false)
  })

  it('평가월 밖의 전일 연차는 만근 판정에 영향 없음', () => {
    const periods = [{ startDate: '2026-05-01', endDate: '2026-05-02' }]
    expect(isFullAttendance('2026-03-15', 1, periods)).toBe(true)
  })

  it('경계에 걸치는 연차는 만근 아님으로 처리', () => {
    const periods = [{ startDate: '2026-04-14', endDate: '2026-04-16' }]
    expect(isFullAttendance('2026-03-15', 1, periods)).toBe(false)
  })
})
