export interface GrantHistoryRow {
  grantDate: string
  amount: number
  note: string | null
  createdBy: number | null
  createdByName: string | null
  createdAt: string
}

export interface UsageHistoryRow {
  startDate: string
  requestedDays: number
  reason: string
  type: string
  approverName: string | null
  createdAt: string
}

export interface ApproverChangeHistoryRow {
  createdAt: string
  beforeApproverName: string | null
  afterApproverName: string
  reason: string
  changedByName: string
}

export interface HistoryEntry {
  category: '발생' | '조정' | '사용' | '결재자 변경'
  date: string
  detail: string
  reason: string
  actorName: string | null
}

interface SortableEntry {
  entry: HistoryEntry
  sortKey: string
}

export function buildHistoryTimeline(params: {
  grants: GrantHistoryRow[]
  usages: UsageHistoryRow[]
  approverChanges: ApproverChangeHistoryRow[]
}): HistoryEntry[] {
  const grantEntries: SortableEntry[] = params.grants.map((g) => ({
    entry: {
      category: g.createdBy === null ? '발생' : '조정',
      date: g.grantDate,
      detail: `${g.amount}일`,
      reason: g.note ?? '-',
      actorName: g.createdByName,
    },
    sortKey: g.createdAt,
  }))

  const usageEntries: SortableEntry[] = params.usages.map((u) => ({
    entry: {
      category: u.type === 'ADJUSTMENT' ? '조정' : '사용',
      date: u.startDate,
      detail: `${u.requestedDays}일`,
      reason: u.reason,
      actorName: u.approverName,
    },
    sortKey: u.createdAt,
  }))

  const approverChangeEntries: SortableEntry[] = params.approverChanges.map((c) => ({
    entry: {
      category: '결재자 변경',
      date: c.createdAt.slice(0, 10),
      detail: `${c.beforeApproverName ?? '미지정'} → ${c.afterApproverName}`,
      reason: c.reason,
      actorName: c.changedByName,
    },
    sortKey: c.createdAt,
  }))

  return [...grantEntries, ...usageEntries, ...approverChangeEntries]
    .sort((a, b) => (a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0))
    .map((s) => s.entry)
}
