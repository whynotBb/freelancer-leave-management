'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { DatePicker } from '@/components/date-picker'
import { getMonthlyAnniversaryIndex, getMonthlyEvaluationPeriod } from '@/lib/domain/leave-cycle'

interface AttendanceExceptionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userName: string
  hireDate: string | null
  onConfirm: (date: string, reason: string) => void
  submitting?: boolean
  error?: string | null
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

// 오늘이 평가월 경계일(자동 발생 배치가 오늘 밤 처리할 평가월의 마지막 날)이면, 그 평가월의
// 시작일부터 선택할 수 있어야 관리자가 "이번 달은 만근 아님"을 당일 안에 등록할 수 있다.
// 경계일이 아니면 오늘부터 선택해도 충분하다(진행 중인 평가월은 아직 마감 전이라 오늘 날짜로도
// 정확히 그 평가월로 해석된다).
function computeMinDate(hireDate: string | null): string {
  const todayStr = today()
  if (!hireDate) return todayStr
  const anniversaryIndex = getMonthlyAnniversaryIndex(hireDate, todayStr)
  if (anniversaryIndex === null) return todayStr
  return getMonthlyEvaluationPeriod(hireDate, anniversaryIndex).start
}

export function AttendanceExceptionDialog({
  open,
  onOpenChange,
  userName,
  hireDate,
  onConfirm,
  submitting = false,
  error = null,
}: AttendanceExceptionDialogProps) {
  const [date, setDate] = useState('')
  const [reason, setReason] = useState('')

  function handleOpenChange(next: boolean) {
    if (!next) {
      setDate('')
      setReason('')
    }
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>만근 예외 등록</DialogTitle>
          <DialogDescription>
            {userName}의 특정 평가월을 만근 아님으로 지정합니다. 해당 평가월에는 자동 연차가
            발생하지 않습니다. 지정할 평가월에 속하는 날짜를 아무 날이나 선택하세요.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <DatePicker
            value={date || undefined}
            onChange={setDate}
            minDate={computeMinDate(hireDate)}
            className="w-full"
          />
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="예외 처리 사유를 입력하세요"
            rows={3}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
            취소
          </Button>
          <Button
            onClick={() => onConfirm(date, reason)}
            disabled={submitting || date.length === 0 || reason.trim().length === 0}
          >
            {submitting ? '저장 중...' : '등록'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
