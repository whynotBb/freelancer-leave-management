'use client'

import { useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { CalendarIcon } from 'lucide-react'
import type { DateRange } from 'react-day-picker'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface DateRangeValue {
  from?: string
  to?: string
}

interface DateRangePickerProps {
  value: DateRangeValue
  onChange: (value: DateRangeValue) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

function toDateRange(value: DateRangeValue): DateRange | undefined {
  return value.from ? { from: parseISO(value.from), to: value.to ? parseISO(value.to) : undefined } : undefined
}

export function DateRangePicker({
  value,
  onChange,
  placeholder = '기간 선택',
  className,
  disabled,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  // 팝오버가 열려 있는 동안의 임시 선택 상태. react-day-picker는 range 모드에서 아무것도
  // 선택되지 않은 상태로 날짜를 클릭하면 from/to를 같은 날로 즉시 채워버린다 — 그 값을 그대로
  // 확정하면 두 번째 날짜를 고를 새도 없이 "선택 완료"로 취급돼 버린다. 그래서 몇 번째 클릭인지
  // 직접 세어, 첫 클릭은 시작일만 반영하고(팝오버 유지) 두 번째 클릭에서만 확정·검색·닫기를 한다.
  const [draft, setDraft] = useState<DateRange | undefined>(undefined)
  const pickingSecondRef = useRef(false)

  const selected = open ? draft : toDateRange(value)

  const label = value.from
    ? value.to
      ? `${format(parseISO(value.from), 'yyyy-MM-dd')} - ${format(parseISO(value.to), 'yyyy-MM-dd')}`
      : format(parseISO(value.from), 'yyyy-MM-dd')
    : placeholder

  function handleOpenChange(next: boolean) {
    if (disabled) return
    if (next) {
      setDraft(toDateRange(value))
      pickingSecondRef.current = false
    }
    setOpen(next)
  }

  function handleSelect(range: DateRange | undefined) {
    if (!range?.from) {
      setDraft(undefined)
      pickingSecondRef.current = false
      return
    }

    if (!pickingSecondRef.current) {
      // 첫 클릭: 시작일만 반영하고 팝오버는 열어 둔 채 두 번째 클릭을 기다린다.
      setDraft({ from: range.from, to: undefined })
      pickingSecondRef.current = true
      return
    }

    // 두 번째 클릭: 같은 날을 다시 클릭했으면 시작일=종료일인 하루짜리 기간으로,
    // 다른 날을 클릭했으면 두 날짜 중 이른 날짜~늦은 날짜로 확정하고 검색을 실행한다.
    const end = range.to ?? range.from
    const [from, to] = range.from <= end ? [range.from, end] : [end, range.from]
    onChange({ from: format(from, 'yyyy-MM-dd'), to: format(to, 'yyyy-MM-dd') })
    setOpen(false)
    pickingSecondRef.current = false
  }

  return (
    <Popover open={open && !disabled} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            'justify-start gap-2 font-normal hover:bg-accent hover:text-accent-foreground aria-expanded:bg-accent aria-expanded:text-accent-foreground',
            !value.from && 'text-muted-foreground',
            className
          )}
        >
          <CalendarIcon className="size-4" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto overflow-hidden p-0" align="start">
        <Calendar
          mode="range"
          numberOfMonths={2}
          captionLayout="label"
          selected={selected}
          onSelect={handleSelect}
        />
      </PopoverContent>
    </Popover>
  )
}
