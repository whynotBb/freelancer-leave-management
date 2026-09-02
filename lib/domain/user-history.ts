import { addMonthsISO } from './date-utils'

export interface GrantHistoryRow {
  grantDate: string
  amount: number
  note: string | null
  createdBy: number | null
  createdByName: string | null
  createdAt: string
  targetUserId?: number
  targetUserName?: string
}

export interface UsageHistoryRow {
  startDate: string
  requestedDays: number
  reason: string
  type: string
  approverName: string | null
  createdAt: string
  targetUserId?: number
  targetUserName?: string
}

export interface ApproverChangeHistoryRow {
  createdAt: string
  beforeApproverName: string | null
  afterApproverName: string
  reason: string
  changedByName: string
  targetUserId?: number
  targetUserName?: string
}

export interface AttendanceExceptionHistoryRow {
  periodStart: string
  reason: string
  createdByName: string | null
  createdAt: string
  targetUserId?: number
  targetUserName?: string
}

export interface AccountEventHistoryRow {
  action: 'SIGNUP_APPROVED' | 'SIGNUP_REJECTED' | 'RESIGNED' | 'PASSWORD_RESET'
  role: 'FREELANCER' | 'APPROVER' | null
  hireDate: string | null
  reason: string | null
  actorName: string | null
  createdAt: string
  targetUserId?: number
  targetUserName?: string
}

export interface HistoryEntry {
  category:
    | '연차 자동 발생'
    | '연차 조정'
    | '사용'
    | '결재자 변경'
    | '입사일 변경'
    | '만근 예외'
    | '가입 승인'
    | '가입 거절'
    | '퇴사'
    | '비밀번호 초기화'
  date: string
  detail: string
  reason: string
  actorName: string | null
  targetUserId?: number
  targetUserName?: string
}

interface SortableEntry {
  entry: HistoryEntry
  sortKey: string
}

const ACCOUNT_EVENT_CATEGORY: Record<AccountEventHistoryRow['action'], HistoryEntry['category']> = {
  SIGNUP_APPROVED: '가입 승인',
  SIGNUP_REJECTED: '가입 거절',
  RESIGNED: '퇴사',
  PASSWORD_RESET: '비밀번호 초기화',
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000

// DB의 timestamp는 UTC로 저장되므로, 표시 직전에 KST(UTC+9, 서머타임 없음)로 변환한다.
// Date.prototype.get*(로컬 타임존 기준) 대신 getUTC*를 써서 실행 환경의 시스템 타임존과
// 무관하게 항상 동일한 결과가 나오도록 한다.
export function formatDateTime(iso: string): string {
  const kst = new Date(new Date(iso).getTime() + KST_OFFSET_MS)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())} ${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}`
}

export function formatAmount(amount: number): string {
  return amount > 0 ? `+${amount}일` : `${amount}일`
}

export function buildHistoryTimeline(params: {
  grants: GrantHistoryRow[]
  usages: UsageHistoryRow[]
  approverChanges: ApproverChangeHistoryRow[]
  exceptions?: AttendanceExceptionHistoryRow[]
  accountEvents?: AccountEventHistoryRow[]
}): HistoryEntry[] {
  const grantEntries: SortableEntry[] = params.grants.map((g) => {
    const isAutoGrant = g.createdBy === null
    const category = isAutoGrant ? '연차 자동 발생' : g.amount === 0 ? '입사일 변경' : '연차 조정'
    return {
      entry: {
        category,
        date: formatDateTime(g.createdAt),
        detail: category === '입사일 변경' ? '-' : formatAmount(g.amount),
        reason: g.note ?? '-',
        // 자동 발생 배치는 createdBy를 남기지 않으므로(사람이 아닌 시스템 처리) 처리자를 "시스템"으로 표시한다.
        actorName: isAutoGrant ? '시스템' : g.createdByName,
        targetUserId: g.targetUserId,
        targetUserName: g.targetUserName,
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
      targetUserId: u.targetUserId,
      targetUserName: u.targetUserName,
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
      targetUserId: c.targetUserId,
      targetUserName: c.targetUserName,
    },
    sortKey: c.createdAt,
  }))

  const exceptionEntries: SortableEntry[] = (params.exceptions ?? []).map((ex) => ({
    entry: {
      category: '만근 예외',
      date: formatDateTime(ex.createdAt),
      detail: `${ex.periodStart} ~ ${addMonthsISO(ex.periodStart, 1)} 미발생`,
      reason: ex.reason,
      actorName: ex.createdByName,
      targetUserId: ex.targetUserId,
      targetUserName: ex.targetUserName,
    },
    sortKey: ex.createdAt,
  }))

  const accountEventEntries: SortableEntry[] = (params.accountEvents ?? []).map((a) => {
    const category = ACCOUNT_EVENT_CATEGORY[a.action]
    const detail =
      a.action === 'SIGNUP_APPROVED'
        ? a.role === 'FREELANCER'
          ? `프리랜서 승인 (입사일 ${a.hireDate})`
          : '결재자 승인'
        : '-'
    return {
      entry: {
        category,
        date: formatDateTime(a.createdAt),
        detail,
        reason: a.reason ?? '-',
        actorName: a.actorName,
        targetUserId: a.targetUserId,
        targetUserName: a.targetUserName,
      },
      sortKey: a.createdAt,
    }
  })

  return [
    ...grantEntries,
    ...usageEntries,
    ...approverChangeEntries,
    ...exceptionEntries,
    ...accountEventEntries,
  ]
    .sort((a, b) => (a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0))
    .map((s) => s.entry)
}

export interface HistoryFilters {
  category?: HistoryEntry['category']
  page: number
  pageSize: number
}

export interface HistoryPage {
  items: HistoryEntry[]
  total: number
  page: number
  pageSize: number
}

// 정렬·병합이 끝난 타임라인 위에서 카테고리 필터링과 페이지 슬라이스만 담당하는 순수 함수.
// DB 조회(lib/db/history.ts)는 이 함수를 호출하기 전에 이미 병합·정렬된 배열을 넘긴다.
export function paginateHistory(entries: HistoryEntry[], filters: HistoryFilters): HistoryPage {
  const filtered = filters.category ? entries.filter((e) => e.category === filters.category) : entries
  const start = (filters.page - 1) * filters.pageSize
  return {
    items: filtered.slice(start, start + filters.pageSize),
    total: filtered.length,
    page: filters.page,
    pageSize: filters.pageSize,
  }
}
