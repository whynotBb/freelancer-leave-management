export interface CalendarDayCell {
  dateStr: string // 'YYYY-MM-DD'
  dayNumber: number
  isCurrentMonth: boolean
  isWeekend: boolean
  isSunday: boolean
  isSaturday: boolean
  isToday: boolean
}

/**
 * 특정 연도와 월(1-12)에 대한 7열(일~토) 달력 날짜 행렬(셀)을 생성합니다.
 * 이전달/다음달 날짜 포함 35개 또는 42개 셀 반환.
 */
export function buildCalendarMonthGrid(year: number, month: number, todayStr?: string): CalendarDayCell[] {
  const now = new Date()
  const defaultToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const today = todayStr ?? defaultToday
  const firstDayOfMonth = new Date(year, month - 1, 1)
  const lastDayOfMonth = new Date(year, month, 0)

  const startDayOfWeek = firstDayOfMonth.getDay() // 0(일) ~ 6(토)
  const daysInMonth = lastDayOfMonth.getDate()

  const cells: CalendarDayCell[] = []

  // 1. 이전 달 날짜 채우기
  const prevMonthLastDay = new Date(year, month - 1, 0).getDate()
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const pDay = prevMonthLastDay - i
    const pDate = new Date(year, month - 2, pDay)
    const dateStr = formatDateString(pDate)
    const dayOfWeek = pDate.getDay()
    cells.push({
      dateStr,
      dayNumber: pDay,
      isCurrentMonth: false,
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
      isSunday: dayOfWeek === 0,
      isSaturday: dayOfWeek === 6,
      isToday: dateStr === today,
    })
  }

  // 2. 현재 달 날짜 채우기
  for (let d = 1; d <= daysInMonth; d++) {
    const cDate = new Date(year, month - 1, d)
    const dateStr = formatDateString(cDate)
    const dayOfWeek = cDate.getDay()
    cells.push({
      dateStr,
      dayNumber: d,
      isCurrentMonth: true,
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
      isSunday: dayOfWeek === 0,
      isSaturday: dayOfWeek === 6,
      isToday: dateStr === today,
    })
  }

  // 3. 다음 달 날짜 채우기 (총 35일 또는 42일로 맞춤)
  const totalCellsNeeded = cells.length > 35 ? 42 : 35
  const remainingCells = totalCellsNeeded - cells.length
  for (let n = 1; n <= remainingCells; n++) {
    const nDate = new Date(year, month, n)
    const dateStr = formatDateString(nDate)
    const dayOfWeek = nDate.getDay()
    cells.push({
      dateStr,
      dayNumber: n,
      isCurrentMonth: false,
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
      isSunday: dayOfWeek === 0,
      isSaturday: dayOfWeek === 6,
      isToday: dateStr === today,
    })
  }

  return cells
}

function formatDateString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export const LEAVE_TYPE_LABEL = {
  FULL: '연차',
  AM_HALF: '오전 반차',
  PM_HALF: '오후 반차',
} as const

export interface MinimalCalendarEvent {
  startDate: string
  endDate: string
  requesterName: string
  id: number
}

/**
 * 캘린더 이벤트 목록을 시작일 오름차순, 동일 일자는 이름 오름차순으로 정렬합니다.
 */
export function sortCalendarEvents<T extends MinimalCalendarEvent>(events: T[]): T[] {
  return [...events].sort((a, b) => {
    if (a.startDate !== b.startDate) {
      return a.startDate.localeCompare(b.startDate)
    }
    if (a.endDate !== b.endDate) {
      return a.endDate.localeCompare(b.endDate)
    }
    return a.requesterName.localeCompare(b.requesterName)
  })
}

