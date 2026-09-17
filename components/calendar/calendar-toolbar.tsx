'use client'

import { ChevronLeftIcon, ChevronRightIcon, CalendarIcon, ListIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

export type CalendarViewMode = 'calendar' | 'list'

interface CalendarToolbarProps {
  year: number
  month: number
  viewMode: CalendarViewMode
  onPrevMonth: () => void
  onNextMonth: () => void
  onToday: () => void
  onViewModeChange: (mode: CalendarViewMode) => void
  onYearMonthChange: (year: number, month: number) => void
}

export function CalendarToolbar({
  year,
  month,
  viewMode,
  onPrevMonth,
  onNextMonth,
  onToday,
  onViewModeChange,
  onYearMonthChange,
}: CalendarToolbarProps) {
  const currentYear = new Date().getFullYear()
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i)
  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* 월 이동 & 오늘 버튼 */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-0.5 sm:gap-1 rounded-md border p-1 bg-background shadow-xs max-w-full">
            <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={onPrevMonth} aria-label="이전달">
              <ChevronLeftIcon className="size-4" />
            </Button>
            <div className="flex items-center gap-0.5 sm:gap-1.5 px-1 sm:px-2 font-semibold">
              <Select value={String(year)} onValueChange={(y) => onYearMonthChange(Number(y), month)}>
                <SelectTrigger className="h-7 w-20 sm:w-24 border-none px-1 sm:px-2 font-bold focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}년
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={String(month)} onValueChange={(m) => onYearMonthChange(year, Number(m))}>
                <SelectTrigger className="h-7 w-14 sm:w-16 border-none px-1 sm:px-1.5 font-bold focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {m}월
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={onNextMonth} aria-label="다음달">
              <ChevronRightIcon className="size-4" />
            </Button>
          </div>

          <Button variant="outline" size="sm" onClick={onToday} className="h-9 gap-1 shrink-0">
            <CalendarIcon className="size-3.5" />
            오늘
          </Button>
        </div>

        <div className="flex w-full justify-end sm:w-auto">
          {/* 달력 / 리스트 보기 전환 아이콘 전용 버튼 */}
          <div className="flex items-center gap-1 rounded-lg border p-1 bg-muted/30 shrink-0">
            <Button
              variant={viewMode === 'calendar' ? 'default' : 'ghost'}
              size="icon"
              className={cn(
                'size-8 transition-all',
                viewMode === 'calendar' && 'shadow-xs'
              )}
              onClick={() => onViewModeChange('calendar')}
              title="달력으로 보기"
              aria-label="달력으로 보기"
            >
              <CalendarIcon className="size-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="icon"
              className={cn(
                'size-8 transition-all',
                viewMode === 'list' && 'shadow-xs'
              )}
              onClick={() => onViewModeChange('list')}
              title="리스트로 보기"
              aria-label="리스트로 보기"
            >
              <ListIcon className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* 범례: 공휴일 / 연차 / 반차 색상 구분 */}
      <div className="flex flex-wrap items-center justify-end gap-3 text-[11px] text-muted-foreground px-0.5">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-red-500" />
          공휴일
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-indigo-500" />
          연차
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-amber-500" />
          오전/오후 반차
        </span>
      </div>
    </div>
  )
}
