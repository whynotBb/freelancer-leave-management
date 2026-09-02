import { formatAmount, formatDateTime } from './user-history'

export type MyLeaveRequestType = 'FULL' | 'AM_HALF' | 'PM_HALF' | 'ADJUSTMENT'
export type MyLeaveRequestStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED'

export interface MyLeaveRequestRow {
  id: number
  title: string
  startDate: string
  endDate: string
  type: MyLeaveRequestType
  requestedDays: number
  status: MyLeaveRequestStatus
  reason: string
  approverId: number
  approverName: string | null
  rejectReason: string | null
  createdAt: string
}

export interface MyGrantRow {
  amount: number
  note: string | null
  createdBy: number | null
  createdByName: string | null
  createdAt: string
}

export type MyDocumentEntry =
  | {
      kind: 'REQUEST'
      id: number
      date: string
      title: string
      startDate: string
      endDate: string
      type: 'FULL' | 'AM_HALF' | 'PM_HALF'
      requestedDays: number
      status: MyLeaveRequestStatus
      reason: string
      approverId: number
      approverName: string | null
      rejectReason: string | null
    }
  | {
      kind: 'ADJUSTMENT'
      category: '연차 자동 발생' | '연차 조정' | '사용 조정'
      date: string
      detail: string
      reason: string
      actorName: string | null
    }

interface SortableEntry {
  entry: MyDocumentEntry
  sortKey: string
}

export function buildMyDocumentTimeline(params: {
  requests: MyLeaveRequestRow[]
  grants: MyGrantRow[]
}): MyDocumentEntry[] {
  const requestEntries: SortableEntry[] = params.requests
    .filter((r) => r.type !== 'ADJUSTMENT')
    .map((r) => ({
      entry: {
        kind: 'REQUEST',
        id: r.id,
        date: formatDateTime(r.createdAt),
        title: r.title,
        startDate: r.startDate,
        endDate: r.endDate,
        type: r.type as 'FULL' | 'AM_HALF' | 'PM_HALF',
        requestedDays: r.requestedDays,
        status: r.status,
        reason: r.reason,
        approverId: r.approverId,
        approverName: r.approverName,
        rejectReason: r.rejectReason,
      },
      sortKey: r.createdAt,
    }))

  // ADJUSTMENT 타입 신청 행(관리자 수동 사용량 조정)은 문서가 아니라 조정 이력이라
  // leaveGrants 쪽 조정 항목과 같은 모양(ADJUSTMENT kind)으로 합친다.
  const usageAdjustmentEntries: SortableEntry[] = params.requests
    .filter((r) => r.type === 'ADJUSTMENT')
    .map((r) => ({
      entry: {
        kind: 'ADJUSTMENT',
        category: '사용 조정',
        date: formatDateTime(r.createdAt),
        detail: formatAmount(r.requestedDays),
        reason: r.reason,
        actorName: r.approverName,
      },
      sortKey: r.createdAt,
    }))

  const grantEntries: SortableEntry[] = params.grants.map((g) => {
    const isAutoGrant = g.createdBy === null
    return {
      entry: {
        kind: 'ADJUSTMENT',
        category: isAutoGrant ? '연차 자동 발생' : '연차 조정',
        date: formatDateTime(g.createdAt),
        detail: formatAmount(g.amount),
        reason: g.note ?? '-',
        actorName: isAutoGrant ? '시스템' : g.createdByName,
      },
      sortKey: g.createdAt,
    }
  })

  return [...requestEntries, ...usageAdjustmentEntries, ...grantEntries]
    .sort((a, b) => (a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0))
    .map((s) => s.entry)
}
