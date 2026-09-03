'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DateRangePicker } from '@/components/date-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { HOLIDAY_PROJECTION_YEARS_AFTER } from '@/lib/domain/holidays'

interface HolidayFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (startDate: string, endDate: string, name: string, isRecurring: boolean) => void
  submitting?: boolean
  error?: string | null
}

export function HolidayFormDialog({
  open,
  onOpenChange,
  onConfirm,
  submitting = false,
  error = null,
}: HolidayFormDialogProps) {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [name, setName] = useState('')
  const [isRecurring, setIsRecurring] = useState(false)

  // 대화창이 열릴 때마다 폼 상태 초기화
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStartDate('')
      setEndDate('')
      setName('')
      setIsRecurring(false)
    }
  }, [open])

  function handleOpenChange(next: boolean) {
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>공휴일 추가</DialogTitle>
          <DialogDescription>
            신정처럼 매년 같은 날짜인 공휴일은 &quot;매년 반복&quot;을 선택하세요. 선택한
            날짜의 월/일이 매년 반복 적용됩니다. 설날·추석 연휴처럼 여러 날짜에 걸친
            공휴일은 시작일~종료일을 선택하세요(하루짜리는 같은 날짜를 두 번 선택).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Checkbox
              id="holiday-recurring"
              checked={isRecurring}
              onCheckedChange={(v) => setIsRecurring(v === true)}
            />
            <Label htmlFor="holiday-recurring">매년 반복</Label>
          </div>
          <div className="space-y-1.5">
            <Label>기간</Label>
            <DateRangePicker
              startValue={startDate}
              endValue={endDate}
              onChange={(start, end) => {
                setStartDate(start)
                setEndDate(end)
              }}
              maxDate={`${new Date().getFullYear() + HOLIDAY_PROJECTION_YEARS_AFTER}-12-31`}
              className="w-full"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="holiday-name">이름</Label>
            <Input
              id="holiday-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 신정"
            />
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
            닫기
          </Button>
          <Button
            onClick={() => onConfirm(startDate, endDate, name, isRecurring)}
            disabled={submitting || startDate.length === 0 || endDate.length === 0 || name.trim().length === 0}
          >
            {submitting ? '저장 중...' : '추가'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
