import { describe, expect, it } from 'vitest'
import { expandHolidayDates, type HolidayRow } from './holidays'

describe('expandHolidayDates', () => {
  it('비반복 공휴일은 저장된 날짜 그대로 포함한다', () => {
    const rows: HolidayRow[] = [{ date: '2026-09-25', name: '추석', isRecurring: false }]
    const result = expandHolidayDates(rows, 2026, 1, 2)
    expect(result.has('2026-09-25')).toBe(true)
    expect(result.size).toBe(1)
  })

  it('반복 공휴일은 지정된 연도 범위 전체에 같은 월/일로 투영된다', () => {
    const rows: HolidayRow[] = [{ date: '2026-01-01', name: '신정', isRecurring: true }]
    const result = expandHolidayDates(rows, 2026, 1, 2)
    expect(result.has('2025-01-01')).toBe(true)
    expect(result.has('2026-01-01')).toBe(true)
    expect(result.has('2027-01-01')).toBe(true)
    expect(result.has('2028-01-01')).toBe(true)
    expect(result.size).toBe(4)
  })

  it('반복 공휴일이 2월 29일이면 윤년에만 포함하고 평년에는 건너뛴다', () => {
    const rows: HolidayRow[] = [{ date: '2024-02-29', name: '테스트', isRecurring: true }]
    const result = expandHolidayDates(rows, 2025, 1, 2) // 범위: 2024~2027
    expect([...result]).toEqual(['2024-02-29'])
  })

  it('반복과 비반복 공휴일이 섞여 있으면 모두 포함한다', () => {
    const rows: HolidayRow[] = [
      { date: '2026-01-01', name: '신정', isRecurring: true },
      { date: '2026-09-25', name: '추석', isRecurring: false },
    ]
    const result = expandHolidayDates(rows, 2026, 0, 0)
    expect(result.has('2026-01-01')).toBe(true)
    expect(result.has('2026-09-25')).toBe(true)
    expect(result.size).toBe(2)
  })
})
