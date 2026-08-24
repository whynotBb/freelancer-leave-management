import { describe, expect, it } from 'vitest'
import { getCurrentCycle, getMonthlyAnniversaryIndex, getMonthlyEvaluationPeriod } from './leave-cycle'

describe('getCurrentCycle', () => {
  it('입사 첫 해는 cycleIndex 0', () => {
    expect(getCurrentCycle('2026-03-15', '2026-06-01')).toEqual({
      cycleIndex: 0,
      start: '2026-03-15',
      end: '2027-03-15',
    })
  })

  it('입사기념일 당일부터 다음 사이클로 넘어간다', () => {
    expect(getCurrentCycle('2026-03-15', '2027-03-15')).toEqual({
      cycleIndex: 1,
      start: '2027-03-15',
      end: '2028-03-15',
    })
  })

  it('두 번째 해 중간', () => {
    expect(getCurrentCycle('2026-03-15', '2027-10-01')).toEqual({
      cycleIndex: 1,
      start: '2027-03-15',
      end: '2028-03-15',
    })
  })
})

describe('getMonthlyEvaluationPeriod', () => {
  it('1번째 달 평가 기간은 입사일부터 1개월', () => {
    expect(getMonthlyEvaluationPeriod('2026-03-15', 1)).toEqual({
      start: '2026-03-15',
      end: '2026-04-15',
    })
  })

  it('13번째 달 평가 기간은 두 번째 사이클로 자연스럽게 이어진다', () => {
    expect(getMonthlyEvaluationPeriod('2026-03-15', 13)).toEqual({
      start: '2027-03-15',
      end: '2027-04-15',
    })
  })
})

describe('getMonthlyAnniversaryIndex', () => {
  it('정확히 월 기념일이면 해당 monthIndex를 반환', () => {
    expect(getMonthlyAnniversaryIndex('2026-03-15', '2026-04-15')).toBe(1)
    expect(getMonthlyAnniversaryIndex('2026-03-15', '2027-03-15')).toBe(12)
  })

  it('기념일이 아니면 null', () => {
    expect(getMonthlyAnniversaryIndex('2026-03-15', '2026-04-16')).toBeNull()
    expect(getMonthlyAnniversaryIndex('2026-03-15', '2026-03-14')).toBeNull()
  })
})
