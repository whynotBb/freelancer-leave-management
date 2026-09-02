'use client'

import { useEffect, useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/date-picker'
import { ApproverCombobox } from '@/components/approver-combobox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { calculateRequestedDays, type LeaveType } from '@/lib/domain/leave-day-count'

export interface MyRequestDocument {
  id: number
  title: string
  startDate: string
  endDate: string
  type: LeaveType
  requestedDays: number
  status: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED'
  reason: string
  approverId: number
  approverName: string | null
  rejectReason: string | null
}

interface Approver {
  id: number
  name: string
  email: string
}

interface LeaveRequestSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'view'
  document: MyRequestDocument | null
  requesterName: string
  approvers: Approver[]
  defaultApproverId: number | null
  remaining: number
  holidayDates: string[]
  onSaved: () => void
}

const STATUS_LABEL: Record<MyRequestDocument['status'], string> = {
  DRAFT: '임시저장',
  PENDING: '대기',
  APPROVED: '승인완료',
  REJECTED: '반려',
  CANCELED: '취소',
}

export function LeaveRequestSheet({
  open,
  onOpenChange,
  mode,
  document,
  requesterName,
  approvers,
  defaultApproverId,
  remaining,
  holidayDates,
  onSaved,
}: LeaveRequestSheetProps) {
  const [title, setTitle] = useState('')
  const [approverId, setApproverId] = useState<number | null>(null)
  const [type, setType] = useState<LeaveType>('FULL')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [overlapWarning, setOverlapWarning] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [editing, setEditing] = useState(false)

  const holidaySet = new Set(holidayDates)
  // 연차 신청 날짜는 미래 날짜다 — DatePicker 기본 상한(올해)에 막혀 연말에는 다음 해 신청이
  // 아예 불가능해지는 것을 막기 위해 내년 말까지 선택 가능하도록 넉넉히 열어둔다.
  const maxLeaveDate = `${new Date().getFullYear() + 1}-12-31`
  const canEditFields = mode === 'create' || (mode === 'view' && document?.status === 'DRAFT' && editing)
  const isExistingDraft = mode === 'view' && document?.status === 'DRAFT'

  useEffect(() => {
    if (!open) return
    setError(null)
    setOverlapWarning(false)
    setEditing(false)
    if (mode === 'create') {
      setTitle('')
      setApproverId(defaultApproverId)
      setType('FULL')
      setStartDate('')
      setEndDate('')
      setReason('')
    } else if (document) {
      setTitle(document.title)
      setApproverId(document.approverId)
      setType(document.type)
      setStartDate(document.startDate)
      setEndDate(document.endDate)
      setReason(document.reason)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, document])

  // 읽기 전용으로 보는 기존 문서(canEditFields === false)는 제출 시점에 이미 확정된
  // requestedDays를 그대로 보여준다 — 이후 공휴일이 새로 등록돼도 재계산하지 않는다(설계 문서
  // "이미 확정된 문서는 재계산하지 않는다" 규칙). 생성 중이거나 DRAFT를 수정 중일 때만
  // 사용자가 바꾸는 날짜에 맞춰 실시간으로 미리보기 계산한다.
  let requestedDays = 0
  if (!canEditFields) {
    requestedDays = document?.requestedDays ?? 0
  } else {
    try {
      requestedDays = startDate && endDate ? calculateRequestedDays(startDate, endDate, type, holidaySet) : 0
    } catch {
      requestedDays = 0
    }
  }

  function handleTypeChange(next: LeaveType) {
    setType(next)
    if (next !== 'FULL') setEndDate(startDate)
  }

  function handleStartDateChange(value: string) {
    setStartDate(value)
    if (type !== 'FULL') setEndDate(value)
  }

  async function submitForm(action: 'save' | 'submit') {
    setError(null)
    setSubmitting(true)
    try {
      const body = { action, title, approverId, startDate, endDate, type, reason }
      const url = mode === 'create' ? '/api/documents' : `/api/documents/${document!.id}`
      const method = mode === 'create' ? 'POST' : 'PATCH'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? '처리에 실패했습니다.')
        return
      }
      // 겹침 경고가 있으면 배너를 보여줘야 하므로 Sheet를 닫지 않는다. 경고가 없는
      // 저장/제출은 성공 즉시 닫아 "임시저장"을 반복 클릭해 중복 DRAFT가 생기는 것을 막는다.
      if (data?.overlapWarning) {
        setOverlapWarning(true)
      } else {
        onOpenChange(false)
      }
      onSaved()
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!document) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/documents/${document.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? '삭제에 실패했습니다.')
        return
      }
      setDeleteConfirmOpen(false)
      onSaved()
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCancel() {
    if (!document) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/documents/${document.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? '취소에 실패했습니다.')
        return
      }
      setCancelConfirmOpen(false)
      onSaved()
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = title.length > 0 && approverId !== null && startDate.length > 0 && endDate.length > 0 && reason.length > 0

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{mode === 'create' ? '연차 신청' : title}</SheetTitle>
            <SheetDescription>
              {mode === 'view' && document ? (
                <Badge variant="outline">{STATUS_LABEL[document.status]}</Badge>
              ) : (
                '결재자를 지정하고 연차를 신청합니다.'
              )}
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 px-4">
            <div className="space-y-1.5">
              <Label>신청인</Label>
              <Input value={requesterName} disabled readOnly />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="leave-title">제목</Label>
              <Input
                id="leave-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={!canEditFields}
              />
            </div>
            <div className="space-y-1.5">
              <Label>결재자</Label>
              <ApproverCombobox
                value={approverId}
                approvers={approvers}
                onChange={setApproverId}
                className="w-full"
                disabled={!canEditFields}
              />
            </div>
            <div className="space-y-1.5">
              <Label>유형</Label>
              <Select value={type} onValueChange={(v) => handleTypeChange(v as LeaveType)} disabled={!canEditFields}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FULL">연차</SelectItem>
                  <SelectItem value="AM_HALF">오전 반차</SelectItem>
                  <SelectItem value="PM_HALF">오후 반차</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {type === 'FULL' ? (
              <div className="flex gap-2">
                <div className="flex-1 space-y-1.5">
                  <Label>시작일</Label>
                  <DatePicker value={startDate} onChange={handleStartDateChange} maxDate={maxLeaveDate} disabled={!canEditFields} className="w-full" />
                </div>
                <div className="flex-1 space-y-1.5">
                  <Label>종료일</Label>
                  <DatePicker value={endDate} onChange={setEndDate} minDate={startDate || undefined} maxDate={maxLeaveDate} disabled={!canEditFields} className="w-full" />
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>날짜</Label>
                <DatePicker value={startDate} onChange={handleStartDateChange} maxDate={maxLeaveDate} disabled={!canEditFields} className="w-full" />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">신청일수</p>
                <p>{requestedDays}일</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">잔여연차</p>
                <p>{remaining}일</p>
              </div>
            </div>
            {overlapWarning && (
              <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
                같은 기간에 이미 대기 또는 승인된 신청이 있습니다.
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="leave-reason">사유</Label>
              <Textarea
                id="leave-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={!canEditFields}
              />
            </div>
            {mode === 'view' && document?.status === 'REJECTED' && document.rejectReason && (
              <p className="text-sm text-destructive">반려 사유: {document.rejectReason}</p>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <SheetFooter>
            {mode === 'create' && (
              <>
                <Button variant="outline" onClick={() => submitForm('save')} disabled={submitting || !canSubmit}>
                  임시저장
                </Button>
                <Button onClick={() => submitForm('submit')} disabled={submitting || !canSubmit}>
                  제출
                </Button>
              </>
            )}
            {isExistingDraft && !editing && (
              <>
                <Button variant="destructive" onClick={() => setDeleteConfirmOpen(true)} disabled={submitting}>
                  삭제
                </Button>
                <Button onClick={() => setEditing(true)}>수정</Button>
              </>
            )}
            {isExistingDraft && editing && (
              <>
                <Button variant="outline" onClick={() => submitForm('save')} disabled={submitting || !canSubmit}>
                  임시저장
                </Button>
                <Button onClick={() => submitForm('submit')} disabled={submitting || !canSubmit}>
                  제출
                </Button>
              </>
            )}
            {mode === 'view' && document?.status === 'PENDING' && (
              <Button variant="destructive" onClick={() => setCancelConfirmOpen(true)} disabled={submitting}>
                취소
              </Button>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <ConfirmDialog
        open={cancelConfirmOpen}
        onOpenChange={setCancelConfirmOpen}
        title="신청 취소"
        description="이 연차 신청을 취소하시겠습니까?"
        confirmLabel="취소하기"
        onConfirm={handleCancel}
        submitting={submitting}
        error={error}
        destructive
      />
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="임시저장 삭제"
        description="이 임시저장 문서를 삭제하시겠습니까? 삭제하면 되돌릴 수 없습니다."
        confirmLabel="삭제"
        onConfirm={handleDelete}
        submitting={submitting}
        error={error}
        destructive
      />
    </>
  )
}
