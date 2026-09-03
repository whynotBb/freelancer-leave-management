'use client'

import { useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { DatePicker, DateRangePicker } from '@/components/date-picker'
import { ApproverCombobox } from '@/components/approver-combobox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { StatusBadge } from '@/components/status-badge'
import { calculateRequestedDays, type LeaveType } from '@/lib/domain/leave-day-count'
import { addMonthsISO } from '@/lib/domain/date-utils'

function RequiredMark() {
  return <span className="text-destructive">*</span>
}

const TITLE_TYPE_LABEL: Record<LeaveType, string> = {
  FULL: '연차',
  AM_HALF: '오전 반차',
  PM_HALF: '오후 반차',
}

// 신청서 제목은 실수 방지를 위해 사용자가 직접 입력하지 않고 신청인/기간/유형으로부터 자동 생성한다.
function buildAutoTitle(requesterName: string, type: LeaveType, startDate: string, endDate: string): string {
  if (!startDate) return ''
  const period =
    !endDate || startDate === endDate
      ? format(parseISO(startDate), 'yyyy.MM.dd')
      : `${format(parseISO(startDate), 'yyyy.MM.dd')} ~ ${format(parseISO(endDate), 'yyyy.MM.dd')}`
  return `${requesterName} - ${period} ${TITLE_TYPE_LABEL[type]} 신청 합니다.`
}

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
  const [approverId, setApproverId] = useState<number | null>(null)
  const [type, setType] = useState<LeaveType>('FULL')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [editing, setEditing] = useState(false)

  const holidaySet = new Set(holidayDates)
  // 연차 신청 날짜는 미래 날짜다 — DatePicker 기본 상한(올해)에 막혀 연말에는 다음 해 신청이
  // 아예 불가능해지는 것을 막기 위해 내년 말까지 선택 가능하도록 넉넉히 열어둔다.
  const maxLeaveDate = `${new Date().getFullYear() + 1}-12-31`
  // 결재가 늦게 올라오는 경우를 감안해 과거 날짜 신청 자체는 허용하되, 오늘로부터 1개월보다
  // 이전 날짜는 달력에서부터 선택하지 못하게 막는다(서버 측 제출 검증은 checkSubmissionEligibility).
  const minLeaveDate = addMonthsISO(format(new Date(), 'yyyy-MM-dd'), -1)
  const canEditFields = mode === 'create' || (mode === 'view' && document?.status === 'DRAFT' && editing)
  const isExistingDraft = mode === 'view' && document?.status === 'DRAFT'

  useEffect(() => {
    if (!open) return
    setError(null)
    setEditing(false)
    if (mode === 'create') {
      setApproverId(defaultApproverId)
      setType('FULL')
      setStartDate('')
      setEndDate('')
      setReason('')
    } else if (document) {
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

  // 편집 가능한 동안(생성 중/임시저장 수정 중)에는 항상 최신 입력값으로 자동 재생성하고,
  // 그 외에는 제출 시점에 이미 확정돼 저장된 제목을 그대로 보여준다.
  const title = canEditFields ? buildAutoTitle(requesterName, type, startDate, endDate) : document?.title ?? ''

  // 편집 중에는 "이 신청이 반영되면 얼마가 남는지"를 바로 보여줘야 실수로 잔여 연차를 초과해
  // 제출하는 것을 미리 막을 수 있다. 이미 제출이 끝난 문서를 볼 때는 그 문서가 반영되기 전
  // 시점의 실제 잔여 연차를 그대로 보여준다(신청일수를 다시 빼면 이중으로 차감돼 보인다).
  const projectedRemaining = canEditFields ? remaining - requestedDays : remaining

  // 시작~종료일을 다 골랐는데도 그 안에 실제로 쉴 평일이 하나도 없는 경우(단일 날짜가
  // 주말/공휴일이거나, 범위 전체가 주말/공휴일로만 이루어진 경우) — 신청해도 실제로
  // 차감되는 연차가 없어 의미가 없으므로 제출을 막는다.
  const noBusinessDays = canEditFields && startDate.length > 0 && endDate.length > 0 && requestedDays === 0

  function handleTypeChange(next: LeaveType) {
    setType(next)
    if (next !== 'FULL') setEndDate(startDate)
  }

  function handleStartDateChange(value: string) {
    setStartDate(value)
    if (type !== 'FULL') setEndDate(value)
  }

  function handleRangeChange(start: string, end: string) {
    setStartDate(start)
    setEndDate(end)
  }

  // 실수로 딤 클릭이나 ESC로 작성 중인 내용을 잃지 않도록, 닫힘 이유가 바깥 클릭/ESC일 때는
  // base-ui의 기본 닫힘 처리를 취소한다. X버튼(close-press)이나 취소/삭제 버튼(imperative)으로만 닫힌다.
  function handleOpenChange(next: boolean, eventDetails: { reason: string; cancel: () => void }) {
    if (!next && (eventDetails.reason === 'outside-press' || eventDetails.reason === 'escape-key')) {
      eventDetails.cancel()
      return
    }
    onOpenChange(next)
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
      // 같은 기간 충돌은 이제 서버에서 에러로 차단되므로(!res.ok 분기), 여기 도달했다면
      // 저장/제출 모두 성공이다 — "임시저장"을 반복 클릭해 중복 DRAFT가 생기는 것을 막기
      // 위해 성공 즉시 닫는다.
      onOpenChange(false)
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

  const canSubmit =
    title.length > 0 &&
    approverId !== null &&
    startDate.length > 0 &&
    endDate.length > 0 &&
    reason.length > 0 &&
    !noBusinessDays

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange} disablePointerDismissal>
        <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-[600px]">
          {/* 이 모달은 제목 아래에 부제(설명) 문구가 있고 그 아래로 폼 본문이 이어지는 구조라,
              구분선이 "제목" 바로 아래가 아니라 "제목+부제" 전체 아래(본문 시작 전)에 와야
              한다 — 기본 DialogTitle의 구분선을 지우고 헤더 전체에 구분선을 준다. */}
          <DialogHeader className="shrink-0 border-b border-border pb-4">
            <DialogTitle className="flex items-start gap-2 border-b-0 pb-0 leading-snug">
              {mode === 'view' && document && <StatusBadge status={document.status} className="mt-0.5 shrink-0" />}
              <span>{mode === 'create' ? '연차 신청' : title}</span>
            </DialogTitle>
            {mode === 'create' && <DialogDescription>결재자를 지정하고 연차를 신청합니다.</DialogDescription>}
          </DialogHeader>
          {/* 내용이 넘칠 때 헤더/푸터는 고정하고 이 영역만 스크롤되도록 분리한다. */}
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-1">
            <div className="space-y-1.5">
              <Label>신청인</Label>
              <Input value={requesterName} disabled readOnly />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="leave-title">제목</Label>
              <Input id="leave-title" value={title} disabled readOnly />
            </div>
            <div className="space-y-1.5">
              <Label>
                결재자 <RequiredMark />
              </Label>
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
              <div className="space-y-1.5">
                <Label>
                  기간 <RequiredMark />
                </Label>
                <DateRangePicker
                  startValue={startDate}
                  endValue={endDate}
                  onChange={handleRangeChange}
                  minDate={minLeaveDate}
                  maxDate={maxLeaveDate}
                  disabled={!canEditFields}
                  holidayDates={holidaySet}
                  className="w-full"
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>
                  날짜 <RequiredMark />
                </Label>
                <DatePicker
                  value={startDate}
                  onChange={handleStartDateChange}
                  minDate={minLeaveDate}
                  maxDate={maxLeaveDate}
                  disabled={!canEditFields}
                  holidayDates={holidaySet}
                  className="w-full"
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">신청일수</p>
                <p className={noBusinessDays ? 'text-destructive' : undefined}>{requestedDays}일</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{canEditFields ? '신청 후 잔여연차' : '잔여연차'}</p>
                <p className={projectedRemaining < 0 ? 'text-destructive' : undefined}>{projectedRemaining}일</p>
              </div>
            </div>
            {noBusinessDays && (
              <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
                선택한 날짜는 주말/공휴일이라 연차를 신청할 수 없습니다. 다른 날짜를 선택해 주세요.
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="leave-reason">
                사유 <RequiredMark />
              </Label>
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
          <DialogFooter className="shrink-0">
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
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
