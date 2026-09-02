import { describe, expect, it } from 'vitest'
import { addMonthsISO, isBeforeDate, isOnOrAfterDate, getYearsOfService } from './date-utils'

describe('addMonthsISO', () => {
  it('일반적인 월 더하기', () => {
    expect(addMonthsISO('2026-03-15', 1)).toBe('2026-04-15')
  })

  it('말일 오버플로우는 대상 월의 마지막 날로 보정된다', () => {
    expect(addMonthsISO('2026-01-31', 1)).toBe('2026-02-28')
  })

  it('연도를 넘어가는 12개월 더하기', () => {
    expect(addMonthsISO('2026-03-15', 12)).toBe('2027-03-15')
  })
})

describe('isBeforeDate / isOnOrAfterDate', () => {
  it('a가 b보다 이전이면 true', () => {
    expect(isBeforeDate('2026-01-01', '2026-01-02')).toBe(true)
    expect(isBeforeDate('2026-01-02', '2026-01-01')).toBe(false)
  })

  it('a가 b와 같거나 이후면 true', () => {
    expect(isOnOrAfterDate('2026-01-02', '2026-01-02')).toBe(true)
    expect(isOnOrAfterDate('2026-01-03', '2026-01-02')).toBe(true)
    expect(isOnOrAfterDate('2026-01-01', '2026-01-02')).toBe(false)
  })
})

describe('getYearsOfService', () => {
  it('입사 1주년이 지나지 않았으면 1년차다', () => {
    expect(getYearsOfService('2026-01-29', '2026-09-02')).toBe(1)
  })

  it('입사일로부터 정확히 N번째 기념일이 지났으면 N+1년차다', () => {
    expect(getYearsOfService('2018-01-29', '2026-09-02')).toBe(9)
  })

  it('입사일 당일은 1년차다', () => {
    expect(getYearsOfService('2026-09-02', '2026-09-02')).toBe(1)
  })
})
