import { describe, expect, it } from 'vitest'
import { buildCalendarMonthGrid, sortCalendarEvents } from './calendar-utils'

describe('buildCalendarMonthGrid', () => {
  it('특정 연월의 35개 또는 42개 셀로 이루어진 캘린더 그리드를 생성한다', () => {
    const grid = buildCalendarMonthGrid(2026, 9, '2026-09-17')
    expect(grid.length).toBeGreaterThanOrEqual(35)
    expect(grid.some((cell) => cell.isToday && cell.dateStr === '2026-09-17')).toBe(true)
  })
})

describe('sortCalendarEvents', () => {
  it('이벤트 목록을 시작일 오름차순 및 이름 오름차순으로 정렬한다', () => {
    const events = [
      { id: 1, startDate: '2026-09-20', endDate: '2026-09-20', requesterName: '홍길동' },
      { id: 2, startDate: '2026-09-05', endDate: '2026-09-05', requesterName: '이몽룡' },
      { id: 3, startDate: '2026-09-05', endDate: '2026-09-05', requesterName: '김철수' },
    ]

    const sorted = sortCalendarEvents(events)

    expect(sorted).toEqual([
      { id: 3, startDate: '2026-09-05', endDate: '2026-09-05', requesterName: '김철수' },
      { id: 2, startDate: '2026-09-05', endDate: '2026-09-05', requesterName: '이몽룡' },
      { id: 1, startDate: '2026-09-20', endDate: '2026-09-20', requesterName: '홍길동' },
    ])
  })
})
