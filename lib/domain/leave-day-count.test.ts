import { describe, expect, it } from 'vitest'
import { calculateRequestedDays } from './leave-day-count'

describe('calculateRequestedDays', () => {
  it('평일로만 이루어진 전일 연차', () => {
    // 2026-08-24는 월요일
    expect(calculateRequestedDays('2026-08-24', '2026-08-26', 'FULL', new Set())).toBe(3)
  })

  it('주말이 포함된 기간은 주말을 제외한다', () => {
    // 2026-08-21(금) ~ 2026-08-24(월): 토/일 제외하고 2일
    expect(calculateRequestedDays('2026-08-21', '2026-08-24', 'FULL', new Set())).toBe(2)
  })

  it('공휴일이 포함된 기간은 공휴일을 제외한다', () => {
    const holidays = new Set(['2026-08-25'])
    expect(calculateRequestedDays('2026-08-24', '2026-08-26', 'FULL', holidays)).toBe(2)
  })

  it('반차는 평일이면 0.5일', () => {
    expect(calculateRequestedDays('2026-08-24', '2026-08-24', 'AM_HALF', new Set())).toBe(0.5)
    expect(calculateRequestedDays('2026-08-24', '2026-08-24', 'PM_HALF', new Set())).toBe(0.5)
  })

  it('반차인데 시작일과 종료일이 다르면 에러', () => {
    expect(() =>
      calculateRequestedDays('2026-08-24', '2026-08-25', 'AM_HALF', new Set())
    ).toThrow('반차는 시작일과 종료일이 같아야 합니다.')
  })
})
