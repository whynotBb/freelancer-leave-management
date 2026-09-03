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
import { DatePicker } from '@/components/date-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface HolidayFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (date: string, name: string, isRecurring: boolean) => void
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
  const [date, setDate] = useState('')
  const [name, setName] = useState('')
  const [isRecurring, setIsRecurring] = useState(false)

  // 대화창이 열릴 때마다 폼 상태 초기화
  useEffect(() => {
    if (open) {
      setDate('')
      setName('')
      setIsRecurring(false)
    }
  }, [open])

  function handleOpenChange(next: boolean) {
    if (!next) {
      setDate('')
      setName('')
      setIsRecurring(false)
    }
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>공휴일 추가</DialogTitle>
          <DialogDescription>
            신정처럼 매년 같은 날짜인 공휴일은 &quot;매년 반복&quot;을 선택하세요. 선택한
            날짜의 월/일이 매년 반복 적용됩니다.
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
            <Label>날짜</Label>
            <DatePicker value={date || undefined} onChange={setDate} className="w-full" />
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
            onClick={() => onConfirm(date, name, isRecurring)}
            disabled={submitting || date.length === 0 || name.trim().length === 0}
          >
            {submitting ? '저장 중...' : '추가'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
