'use client'

import { useState, useMemo } from 'react'
import { eachDayOfInterval, parseISO } from 'date-fns'
import type { CalendarDayCell } from '@/lib/domain/calendar-utils'
import { toISODate } from '@/lib/domain/date-utils'
import type { CalendarEventRow, CalendarHolidayRow } from '@/lib/db/calendar'
import { DayEventsDialog } from '@/components/calendar/day-events-dialog'
import { cn } from '@/lib/utils'

interface MonthlyCalendarGridProps {
  cells: CalendarDayCell[]
  events: CalendarEventRow[]
  holidays: CalendarHolidayRow[]
  onEventClick: (event: CalendarEventRow) => void
}

const WEEK_DAYS = ['일', '월', '화', '수', '목', '금', '토']

function getDatesInRange(startStr: string, endStr: string): string[] {
  if (!startStr || !endStr) return []
  if (startStr > endStr) return [startStr]
  return eachDayOfInterval({ start: parseISO(startStr), end: parseISO(endStr) }).map(toISODate)
}

export function MonthlyCalendarGrid({
  cells,
  events,
  holidays,
  onEventClick,
}: MonthlyCalendarGridProps) {
  const [selectedDayEvents, setSelectedDayEvents] = useState<{
    dateStr: string
    events: CalendarEventRow[]
  } | null>(null)

  // 날짜별 공휴일 매핑
  const holidayMap = useMemo(() => {
    const map = new Map<string, CalendarHolidayRow>()
    for (const h of holidays) {
      map.set(h.date, h)
    }
    return map
  }, [holidays])

  // 날짜별 이벤트 매핑 (각 날짜에 속하는 이벤트 목록)
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEventRow[]>()
    for (const event of events) {
      const dates = getDatesInRange(event.startDate, event.endDate)
      for (const dStr of dates) {
        if (!map.has(dStr)) map.set(dStr, [])
        map.get(dStr)!.push(event)
      }
    }
    return map
  }, [events])

  return (
    <div className="w-full rounded-lg border bg-card shadow-xs overflow-hidden">
      {/* 7열 요일 헤더 */}
      <div className="grid grid-cols-7 border-b bg-muted/50 text-center text-xs font-semibold">
        {WEEK_DAYS.map((day, idx) => (
          <div
            key={day}
            className={cn(
              'py-2.5',
              idx === 0 && 'text-red-500 dark:text-red-400',
              idx === 6 && 'text-blue-500 dark:text-blue-400'
            )}
          >
            {day}
          </div>
        ))}
      </div>

      {/* 달력 그리드 타일 (35개 또는 42개 셀) */}
      <div className="grid grid-cols-7 divide-x divide-y border-b text-xs">
        {cells.map((cell) => {
          const holiday = holidayMap.get(cell.dateStr)
          const cellEvents = eventsByDate.get(cell.dateStr) ?? []
          const isRedDay = cell.isSunday || !!holiday

          return (
            <div
              key={cell.dateStr}
              className={cn(
                'min-h-[72px] sm:min-h-[110px] p-1 sm:p-1.5 flex flex-col justify-between transition-colors',
                !cell.isCurrentMonth && 'bg-muted/30 opacity-40',
                cell.isCurrentMonth && !isRedDay && !cell.isSaturday && 'bg-background',
                cell.isCurrentMonth && cell.isSaturday && 'bg-slate-50/30 dark:bg-slate-950/20',
                cell.isCurrentMonth && isRedDay && 'bg-red-50/30 dark:bg-red-950/20',
                cell.isToday && 'bg-primary/5 dark:bg-primary/10'
              )}
            >
              {/* 셀 헤더 (날짜 숫자 & 공휴일 이름) */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-0.5 sm:mb-1 gap-0.5">
                <span
                  className={cn(
                    'inline-flex size-5 sm:size-6 items-center justify-center rounded-full text-[11px] sm:text-xs font-semibold shrink-0',
                    cell.isToday && 'bg-primary text-primary-foreground font-bold',
                    !cell.isToday && isRedDay && 'text-red-500 dark:text-red-400 font-bold',
                    !cell.isToday && cell.isSaturday && 'text-blue-500 dark:text-blue-400 font-bold',
                    !cell.isToday && !isRedDay && !cell.isSaturday && cell.isCurrentMonth && 'text-foreground'
                  )}
                >
                  {cell.dayNumber}
                </span>

                {holiday && (
                  <span className="truncate rounded-sm bg-red-100 dark:bg-red-950 px-1 py-0.5 text-[9px] sm:text-[10px] font-bold text-red-600 dark:text-red-300 max-w-full sm:max-w-none leading-tight">
                    {holiday.name}
                  </span>
                )}
              </div>

              {/* 모바일 뷰 (sm 미만): 컴팩트 미니 칩 / 도트 라벨 */}
              <div className="flex sm:hidden flex-wrap gap-1 items-center content-start flex-1 overflow-hidden">
                {cellEvents.slice(0, 2).map((evt) => (
                  <button
                    key={`mob-${evt.id}-${cell.dateStr}`}
                    onClick={() => onEventClick(evt)}
                    className={cn(
                      'inline-flex items-center gap-1 max-w-full rounded-md px-1 py-0.5 text-[9px] font-semibold leading-none transition-transform active:scale-95',
                      evt.type === 'FULL'
                        ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20'
                        : 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/20'
                    )}
                    title={`${evt.requesterName}: ${evt.title}`}
                  >
                    <span
                      className={cn(
                        'size-1.5 rounded-full shrink-0',
                        evt.type === 'FULL' ? 'bg-indigo-500' : 'bg-amber-500'
                      )}
                    />
                    <span className="truncate max-w-[32px]">{evt.requesterName}</span>
                  </button>
                ))}

                {cellEvents.length > 2 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedDayEvents({ dateStr: cell.dateStr, events: cellEvents })
                    }}
                    className="text-[9px] font-bold text-primary hover:underline px-0.5 py-0.5 leading-none transition-colors"
                  >
                    more &gt;
                  </button>
                )}
              </div>

              {/* 데스크탑 뷰 (sm 이상): 기존 이벤트 바 리스트 */}
              <div className="hidden sm:flex flex-1 flex-col space-y-1 overflow-y-auto max-h-[72px] no-scrollbar">
                {cellEvents.slice(0, 2).map((evt) => (
                  <button
                    key={`dt-${evt.id}-${cell.dateStr}`}
                    onClick={() => onEventClick(evt)}
                    className={cn(
                      'w-full text-left truncate rounded px-1.5 py-0.5 text-[11px] transition-all hover:opacity-85 font-medium flex items-center justify-between gap-1',
                      evt.type === 'FULL' &&
                        (evt.isMine
                          ? 'bg-indigo-600 text-white font-bold shadow-xs dark:bg-indigo-500'
                          : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200'),
                      (evt.type === 'AM_HALF' || evt.type === 'PM_HALF') &&
                        (evt.isMine
                          ? 'bg-amber-500 text-white font-bold'
                          : 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200')
                    )}
                    title={`${evt.requesterName}: ${evt.title}`}
                  >
                    <span className="truncate">{evt.requesterName}</span>
                    <span className="shrink-0 text-[10px] opacity-90">
                      {evt.type === 'AM_HALF' ? '오전' : evt.type === 'PM_HALF' ? '오후' : ''}
                    </span>
                  </button>
                ))}

                {cellEvents.length > 2 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedDayEvents({ dateStr: cell.dateStr, events: cellEvents })
                    }}
                    className="w-full text-left text-[10px] font-bold text-primary hover:bg-accent/60 rounded px-1.5 py-0.5 transition-colors flex items-center justify-between mt-auto"
                  >
                    <span>+{cellEvents.length - 2} more</span>
                    <span>&gt;</span>
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* 날짜별 전체 휴가 목록 팝업 */}
      <DayEventsDialog
        dateStr={selectedDayEvents?.dateStr ?? null}
        events={selectedDayEvents?.events ?? []}
        open={!!selectedDayEvents}
        onOpenChange={(open) => {
          if (!open) setSelectedDayEvents(null)
        }}
        onEventClick={onEventClick}
      />
    </div>
  )
}
