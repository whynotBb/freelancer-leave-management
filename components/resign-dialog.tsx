'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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

interface ResignDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: number | null
  userName: string
}

export function ResignDialog({ open, onOpenChange, userId, userName }: ResignDialogProps) {
  const router = useRouter()
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingCount, setPendingCount] = useState<number | null>(null)

  function handleOpenChange(next: boolean) {
    if (!next) {
      setReason('')
      setError(null)
      setPendingCount(null)
    }
    onOpenChange(next)
  }

  async function submit(delegate: boolean) {
    if (!userId) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/users/${userId}/resign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, delegate }),
      })
      if (res.status === 409) {
        const body = await res.json()
        setPendingCount(body.pendingCount ?? 0)
        return
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError(body?.error ?? '처리에 실패했습니다.')
        return
      }
      handleOpenChange(false)
      router.push('/admin/departures')
    } catch {
      setError('처리에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>퇴사 처리</DialogTitle>
          <DialogDescription>
            {userName}을(를) 퇴사 처리합니다. 처리 즉시 로그인이 차단되며, 퇴사자 관리 화면에서
            복구하거나 정보를 삭제할 수 있습니다.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="퇴사 사유를 입력하세요"
            rows={3}
          />
          {pendingCount !== null && (
            <p className="text-sm text-destructive">
              대기 중인 결재 건 {pendingCount}건이 있습니다. 먼저 처리하거나, 지금 로그인한
              최고관리자에게 위임하고 퇴사 처리를 진행할 수 있습니다.
            </p>
          )}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
            취소
          </Button>
          {pendingCount !== null ? (
            <Button onClick={() => submit(true)} disabled={submitting || reason.trim().length === 0}>
              {submitting ? '처리 중...' : '나에게 위임하고 퇴사 처리'}
            </Button>
          ) : (
            <Button onClick={() => submit(false)} disabled={submitting || reason.trim().length === 0}>
              {submitting ? '처리 중...' : '퇴사 처리'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
