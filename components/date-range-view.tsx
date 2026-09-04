'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { CalendarIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

interface DateRangeViewProps {
  startDate: string
  endDate: string
  className?: string
}

// components/date-picker.tsx의 DateRangePicker와 같은 Popover+Calendar 패턴을 쓰되, 조회
// 전용이라 onDayClick/onSelect로 값을 바꾸는 로직이 없다 — selected가 매 렌더 동일한 값으로
// 고정돼 있어 날짜를 클릭해도 아무 것도 바뀌지 않는다.
export function DateRangeView({ startDate, endDate, className }: DateRangeViewProps) {
  const [open, setOpen] = useState(false)
  const from = parseISO(startDate)
  const to = parseISO(endDate)
  const label =
    startDate === endDate
      ? format(from, 'yyyy-MM-dd')
      : `${format(from, 'yyyy-MM-dd')} ~ ${format(to, 'yyyy-MM-dd')}`

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            'w-full justify-start gap-2 font-normal hover:bg-accent hover:text-accent-foreground aria-expanded:bg-accent aria-expanded:text-accent-foreground',
            className
          )}
        >
          <CalendarIcon className="size-4" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          numberOfMonths={startDate === endDate ? 1 : 2}
          defaultMonth={from}
          selected={{ from, to }}
        />
      </PopoverContent>
    </Popover>
  )
}
