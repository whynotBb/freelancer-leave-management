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

interface Change {
  label: string
  before: string
  after: string
}

interface LeaveAdjustmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  changes: Change[]
  onConfirm: (reason: string) => void
  submitting?: boolean
}

export function LeaveAdjustmentDialog({
  open,
  onOpenChange,
  changes,
  onConfirm,
  submitting = false,
}: LeaveAdjustmentDialogProps) {
  const [reason, setReason] = useState('')

  function handleOpenChange(next: boolean) {
    if (!next) setReason('')
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>변경 사유 입력</DialogTitle>
          <DialogDescription>아래 변경사항을 저장하려면 사유를 입력하세요.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1 text-sm">
          {changes.map((c) => (
            <div key={c.label} className="flex justify-between gap-2">
              <span className="text-muted-foreground">{c.label}</span>
              <span>
                {c.before} → <span className="font-medium">{c.after}</span>
              </span>
            </div>
          ))}
        </div>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="변경 사유를 입력하세요"
          rows={3}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
            취소
          </Button>
          <Button
            onClick={() => onConfirm(reason)}
            disabled={submitting || reason.trim().length === 0}
          >
            {submitting ? '저장 중...' : '확인'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
