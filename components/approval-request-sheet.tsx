'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { StatusBadge } from '@/components/status-badge'

const TYPE_LABEL: Record<'FULL' | 'AM_HALF' | 'PM_HALF', string> = {
  FULL: '연차',
  AM_HALF: '오전 반차',
  PM_HALF: '오후 반차',
}

export interface ApprovalDocument {
  id: number
  title: string
  requesterName: string
  startDate: string
  endDate: string
  type: 'FULL' | 'AM_HALF' | 'PM_HALF'
  requestedDays: number
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED'
  reason: string
  rejectReason: string | null
}

interface ApprovalRequestSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  document: ApprovalDocument | null
  onProcessed: () => void
}

export function ApprovalRequestSheet({ open, onOpenChange, document, onProcessed }: ApprovalRequestSheetProps) {
  const [approveConfirmOpen, setApproveConfirmOpen] = useState(false)
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!document) return null

  async function process(action: 'approve' | 'reject') {
    setError(null)
    setSubmitting(true)
    try {
      const body = action === 'approve' ? { action } : { action, rejectReason }
      const res = await fetch(`/api/approvals/${document!.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? '처리에 실패했습니다.')
        return
      }
      setApproveConfirmOpen(false)
      setRejectDialogOpen(false)
      setRejectReason('')
      onProcessed()
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-[600px]">
          <DialogHeader className="shrink-0 border-b border-border pb-4">
            <DialogTitle className="flex items-start gap-2 border-b-0 pb-0 leading-snug">
              <StatusBadge status={document.status} className="mt-0.5 shrink-0" />
              <span>{document.title}</span>
            </DialogTitle>
            <DialogDescription>결재 대상 휴가계 상세입니다.</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-1">
            <div className="space-y-1.5">
              <Label>신청인</Label>
              <Input value={document.requesterName} disabled readOnly />
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">유형</p>
                <p>{TYPE_LABEL[document.type]}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">신청일수</p>
                <p>{document.requestedDays}일</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>기간</Label>
              <Input
                value={
                  document.startDate === document.endDate
                    ? document.startDate
                    : `${document.startDate} ~ ${document.endDate}`
                }
                disabled
                readOnly
              />
            </div>
            <div className="space-y-1.5">
              <Label>사유</Label>
              <Textarea value={document.reason} disabled readOnly />
            </div>
            {document.status === 'REJECTED' && document.rejectReason && (
              <p className="text-sm text-destructive">반려 사유: {document.rejectReason}</p>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter className="shrink-0">
            {document.status === 'PENDING' && (
              <>
                <Button variant="outline" onClick={() => setRejectDialogOpen(true)} disabled={submitting}>
                  반려
                </Button>
                <Button onClick={() => setApproveConfirmOpen(true)} disabled={submitting}>
                  승인
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={approveConfirmOpen}
        onOpenChange={setApproveConfirmOpen}
        title="휴가 신청 승인"
        description={`"${document.title}" 신청을 승인하시겠습니까? 승인 후에는 되돌릴 수 없습니다.`}
        confirmLabel="승인"
        onConfirm={() => process('approve')}
        submitting={submitting}
        error={error}
      />
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>휴가 신청 반려</DialogTitle>
            <DialogDescription className="py-2">반려 사유를 입력해 주세요.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="반려 사유 (필수)"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)} disabled={submitting}>
              취소
            </Button>
            <Button
              variant="destructive"
              onClick={() => process('reject')}
              disabled={submitting || rejectReason.trim().length === 0}
            >
              반려
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
