'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { CalendarIcon } from 'lucide-react'
import type { DateRange } from 'react-day-picker'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

interface DatePickerProps {
  value?: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  minDate?: string
  maxDate?: string
}

// 키보드로 직접 입력하지 못하도록 텍스트 인풋 대신 버튼 트리거 + 캘린더 팝오버로 구성한다.
// 네이티브 select(연도/월 드롭다운)의 옵션을 고르는 상호작용을 Popover가 "바깥 클릭"으로
// 오인해 팝오버를 즉시 닫아버리는 문제가 있어(select의 OS 드롭다운은 앱 DOM 트리 밖에서
// 렌더링된다), select/option을 대상으로 한 상호작용은 닫힘 처리에서 제외한다.
function ignoreSelectInteraction(event: { target: EventTarget | null; preventDefault: () => void }) {
  const target = event.target
  if (target instanceof HTMLElement && target.closest('select, option')) {
    event.preventDefault()
  }
}

export function DatePicker({
  value,
  onChange,
  placeholder = '날짜 선택',
  className,
  disabled,
  minDate,
  maxDate,
}: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const selected = value ? parseISO(value) : undefined

  // 연도 드롭다운은 기본으로 100년 전부터 보여줘서 실제로 쓰이는 범위(최근 몇 년)에 비해
  // 옵션이 지나치게 많다 — 올해 기준 최근 5년으로 좁힌다. 이미 그 범위보다 오래된 날짜가
  // 선택돼 있는 경우(예: 5년 넘은 입사일 수정)에는 그 연도까지는 포함해 선택값이 범위 밖으로
  // 밀려나 못 고르는 일이 없게 한다.
  // maxDate가 주어지면(예: 미래 날짜인 휴가 신청) 상한을 그 연도까지 넓힌다 — 주어지지 않으면
  // 기존과 동일하게 올해까지만 허용해 다른 호출부(입사일 입력 등)의 동작을 바꾸지 않는다.
  const currentYear = new Date().getFullYear()
  const selectedYear = selected?.getFullYear()
  const startYear = selectedYear !== undefined ? Math.min(selectedYear, currentYear - 5) : currentYear - 5
  const maxYear = maxDate ? parseISO(maxDate).getFullYear() : currentYear
  const endYear = selectedYear !== undefined ? Math.max(selectedYear, maxYear) : maxYear

  const disabledMatchers = [
    ...(minDate ? [{ before: parseISO(minDate) }] : []),
    ...(maxDate ? [{ after: parseISO(maxDate) }] : []),
  ]

  return (
    <Popover open={open && !disabled} onOpenChange={(next) => !disabled && setOpen(next)}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            'w-40 justify-start gap-2 font-normal hover:bg-accent hover:text-accent-foreground aria-expanded:bg-accent aria-expanded:text-accent-foreground',
            !value && 'text-muted-foreground',
            className
          )}
        >
          <CalendarIcon className="size-4" />
          {selected ? format(selected, 'yyyy-MM-dd') : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0"
        align="start"
        onPointerDownOutside={ignoreSelectInteraction}
        onFocusOutside={ignoreSelectInteraction}
      >
        <Calendar
          mode="single"
          selected={selected}
          startMonth={new Date(startYear, 0)}
          endMonth={new Date(endYear, 11)}
          disabled={disabledMatchers.length > 0 ? disabledMatchers : undefined}
          onSelect={(date) => {
            if (!date) return
            onChange(format(date, 'yyyy-MM-dd'))
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

interface DateRangePickerProps {
  startValue?: string
  endValue?: string
  onChange: (start: string, end: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  minDate?: string
  maxDate?: string
}

// 연차(전일) 신청은 시작일/종료일을 한 번에 고르는 게 자연스러워, 별도 트리거 2개 대신
// 캘린더 하나에서 범위를 선택하는 range 모드 피커를 둔다.
export function DateRangePicker({
  startValue,
  endValue,
  onChange,
  placeholder = '기간 선택',
  className,
  disabled,
  minDate,
  maxDate,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  // react-day-picker의 range 선택은 클릭 한 번만으로도 이미 완결된 1일짜리 range({from,to}가
  // 모두 채워짐)를 돌려주므로, range.to 유무만으로는 "시작일만 찍었는지 종료일까지 찍었는지"를
  // 구분할 수 없다. 팝오버를 여는 시점에 초기화되는 이 플래그로 "이번에 연 뒤 몇 번째 클릭인지"를
  // 직접 추적해, 첫 클릭에서는 닫지 않고 두 번째 클릭에서만 닫는다(같은 날을 두 번 찍으면 1일 선택).
  const [pendingSecondClick, setPendingSecondClick] = useState(false)
  const selectedRange: DateRange | undefined = startValue
    ? { from: parseISO(startValue), to: endValue ? parseISO(endValue) : undefined }
    : undefined

  const currentYear = new Date().getFullYear()
  const startYear = startValue ? Math.min(parseISO(startValue).getFullYear(), currentYear - 5) : currentYear - 5
  const maxYear = maxDate ? parseISO(maxDate).getFullYear() : currentYear
  const endYear = endValue ? Math.max(parseISO(endValue).getFullYear(), maxYear) : maxYear

  const disabledMatchers = [
    ...(minDate ? [{ before: parseISO(minDate) }] : []),
    ...(maxDate ? [{ after: parseISO(maxDate) }] : []),
  ]

  const label = startValue
    ? `${format(parseISO(startValue), 'yyyy-MM-dd')}${
        endValue && endValue !== startValue ? ` ~ ${format(parseISO(endValue), 'yyyy-MM-dd')}` : ''
      }`
    : placeholder

  return (
    <Popover
      open={open && !disabled}
      onOpenChange={(next) => {
        if (disabled) return
        setOpen(next)
        if (next) setPendingSecondClick(false)
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            'justify-start gap-2 font-normal hover:bg-accent hover:text-accent-foreground aria-expanded:bg-accent aria-expanded:text-accent-foreground',
            !startValue && 'text-muted-foreground',
            className
          )}
        >
          <CalendarIcon className="size-4" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0"
        align="start"
        onPointerDownOutside={ignoreSelectInteraction}
        onFocusOutside={ignoreSelectInteraction}
      >
        <Calendar
          mode="range"
          numberOfMonths={2}
          selected={selectedRange}
          startMonth={new Date(startYear, 0)}
          endMonth={new Date(endYear, 11)}
          disabled={disabledMatchers.length > 0 ? disabledMatchers : undefined}
          onSelect={(range) => {
            if (!range?.from) return
            onChange(format(range.from, 'yyyy-MM-dd'), format(range.to ?? range.from, 'yyyy-MM-dd'))
            if (pendingSecondClick) {
              setOpen(false)
              setPendingSecondClick(false)
            } else {
              setPendingSecondClick(true)
            }
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
