import { describe, expect, it } from 'vitest'
import { addMonthsISO, isBeforeDate, isOnOrAfterDate } from './date-utils'

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
