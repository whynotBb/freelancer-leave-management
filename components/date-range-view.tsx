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
// 전용이라 onDayClick/onSelect로 값을 바꾸는 로직이 없다. 그것만으로는 각 날짜 버튼이 여전히
// 클릭 가능한 것처럼 보이고 호버/포커스 상호작용도 그대로 남으므로, disabled={true}로 모든
// 날짜의 클릭·키보드 상호작용 자체를 막는다(월 이동/드롭다운 내비게이션은 disabled 대상이
// 아니라 그대로 동작). disabled 기본 스타일(회색 처리)은 하이라이트된 기간을 흐리게 만들어
// 열람 목적에 맞지 않으므로, 이 컴포넌트에서만 classNames.disabled를 비워 시각적으로는
// 원래 하이라이트 그대로 보이게 한다.
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
          disabled={true}
          classNames={{ disabled: '' }}
        />
      </PopoverContent>
    </Popover>
  )
}
