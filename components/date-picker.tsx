'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { CalendarIcon } from 'lucide-react'
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
}: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const selected = value ? parseISO(value) : undefined

  // 연도 드롭다운은 기본으로 100년 전부터 보여줘서 실제로 쓰이는 범위(최근 몇 년)에 비해
  // 옵션이 지나치게 많다 — 올해 기준 최근 5년으로 좁힌다. 이미 그 범위보다 오래된 날짜가
  // 선택돼 있는 경우(예: 5년 넘은 입사일 수정)에는 그 연도까지는 포함해 선택값이 범위 밖으로
  // 밀려나 못 고르는 일이 없게 한다.
  const currentYear = new Date().getFullYear()
  const selectedYear = selected?.getFullYear()
  const startYear = selectedYear !== undefined ? Math.min(selectedYear, currentYear - 5) : currentYear - 5
  const endYear = selectedYear !== undefined ? Math.max(selectedYear, currentYear) : currentYear

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
          disabled={minDate ? { before: parseISO(minDate) } : undefined}
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
