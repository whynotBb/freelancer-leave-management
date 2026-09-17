'use client'

import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '@/components/page-header'
import { LoadingSpinner } from '@/components/loading-spinner'
import { CalendarToolbar, type CalendarViewMode } from '@/components/calendar/calendar-toolbar'
import { MonthlyCalendarGrid } from '@/components/calendar/monthly-calendar-grid'
import { CalendarListView } from '@/components/calendar/calendar-list-view'
import { CalendarEventDialog } from '@/components/calendar/calendar-event-dialog'
import { buildCalendarMonthGrid } from '@/lib/domain/calendar-utils'
import type { CalendarEventRow, CalendarHolidayRow } from '@/lib/db/calendar'

export default function CalendarPage() {
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [month, setMonth] = useState(() => new Date().getMonth() + 1)
  const [viewMode, setViewMode] = useState<CalendarViewMode>('calendar')

  const [events, setEvents] = useState<CalendarEventRow[]>([])
  const [holidays, setHolidays] = useState<CalendarHolidayRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [selectedEvent, setSelectedEvent] = useState<CalendarEventRow | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  // 월 달력 셀 행렬 생성
  const monthCells = useMemo(() => buildCalendarMonthGrid(year, month), [year, month])

  function loadCalendarData() {
    setLoading(true)
    setLoadError(null)
    fetch(`/api/calendar?year=${year}&month=${month}`)
      .then((res) => {
        if (!res.ok) throw new Error('캘린더 데이터를 불러오지 못했습니다.')
        return res.json()
      })
      .then((data: { events: CalendarEventRow[]; holidays: CalendarHolidayRow[] }) => {
        setEvents(data.events)
        setHolidays(data.holidays)
      })
      .catch(() => setLoadError('데이터를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadCalendarData()

    const handleRefresh = () => {
      loadCalendarData()
    }

    const handleNotification = (e: Event) => {
      const customEvent = e as CustomEvent<{ newItems: { type: string }[] }>
      const newItems = customEvent.detail?.newItems ?? []
      const relevant = newItems.some((item) =>
        ['LEAVE_APPROVED', 'LEAVE_SUBMITTED'].includes(item.type)
      )
      if (relevant) {
        loadCalendarData()
      }
    }

    window.addEventListener('app:refresh-data', handleRefresh)
    window.addEventListener('app:notification-received', handleNotification)

    return () => {
      window.removeEventListener('app:refresh-data', handleRefresh)
      window.removeEventListener('app:notification-received', handleNotification)
    }
  }, [year, month])

  function handlePrevMonth() {
    if (month === 1) {
      setYear((y) => y - 1)
      setMonth(12)
    } else {
      setMonth((m) => m - 1)
    }
  }

  function handleNextMonth() {
    if (month === 12) {
      setYear((y) => y + 1)
      setMonth(1)
    } else {
      setMonth((m) => m + 1)
    }
  }

  function handleToday() {
    const now = new Date()
    setYear(now.getFullYear())
    setMonth(now.getMonth() + 1)
  }

  function handleEventClick(evt: CalendarEventRow) {
    setSelectedEvent(evt)
    setDialogOpen(true)
  }

  return (
    <div className="w-full space-y-6 pb-8">
      <PageHeader
        title="휴가 캘린더"
        description="팀원의 승인된 휴가 일정과 공휴일을 월간 달력 또는 리스트로 확인합니다."
      />

      <CalendarToolbar
        year={year}
        month={month}
        viewMode={viewMode}
        onPrevMonth={handlePrevMonth}
        onNextMonth={handleNextMonth}
        onToday={handleToday}
        onViewModeChange={setViewMode}
        onYearMonthChange={(y, m) => {
          setYear(y)
          setMonth(m)
        }}
      />

      {loading ? (
        <LoadingSpinner />
      ) : loadError ? (
        <p className="text-sm text-destructive">{loadError}</p>
      ) : viewMode === 'calendar' ? (
        <MonthlyCalendarGrid
          cells={monthCells}
          events={events}
          holidays={holidays}
          onEventClick={handleEventClick}
        />
      ) : (
        <CalendarListView
          events={events}
          onEventClick={handleEventClick}
          year={year}
          month={month}
        />
      )}

      <CalendarEventDialog
        event={selectedEvent}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  )
}
