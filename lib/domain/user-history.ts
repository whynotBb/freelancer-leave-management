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
  category: '발생' | '연차 조정' | '사용' | '결재자 변경' | '입사일 변경'
  date: string
  detail: string
  reason: string
  actorName: string | null
}

interface SortableEntry {
  entry: HistoryEntry
  sortKey: string
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000

// DB의 timestamp는 UTC로 저장되므로, 표시 직전에 KST(UTC+9, 서머타임 없음)로 변환한다.
// Date.prototype.get*(로컬 타임존 기준) 대신 getUTC*를 써서 실행 환경의 시스템 타임존과
// 무관하게 항상 동일한 결과가 나오도록 한다.
function formatDateTime(iso: string): string {
  const kst = new Date(new Date(iso).getTime() + KST_OFFSET_MS)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())} ${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}`
}

function formatAmount(amount: number): string {
  return amount > 0 ? `+${amount}일` : `${amount}일`
}

export function buildHistoryTimeline(params: {
  grants: GrantHistoryRow[]
  usages: UsageHistoryRow[]
  approverChanges: ApproverChangeHistoryRow[]
}): HistoryEntry[] {
  const grantEntries: SortableEntry[] = params.grants.map((g) => {
    const category = g.createdBy === null ? '발생' : g.amount === 0 ? '입사일 변경' : '연차 조정'
    return {
      entry: {
        category,
        date: formatDateTime(g.createdAt),
        detail: category === '입사일 변경' ? '-' : formatAmount(g.amount),
        reason: g.note ?? '-',
        actorName: g.createdByName,
      },
      sortKey: g.createdAt,
    }
  })

  const usageEntries: SortableEntry[] = params.usages.map((u) => ({
    entry: {
      category: u.type === 'ADJUSTMENT' ? '연차 조정' : '사용',
      date: formatDateTime(u.createdAt),
      detail: formatAmount(u.requestedDays),
      reason: u.reason,
      actorName: u.approverName,
    },
    sortKey: u.createdAt,
  }))

  const approverChangeEntries: SortableEntry[] = params.approverChanges.map((c) => ({
    entry: {
      category: '결재자 변경',
      date: formatDateTime(c.createdAt),
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
