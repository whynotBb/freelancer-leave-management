import type { HistoryEntry } from './user-history'

export type ExportMode = 'all' | 'mine' | 'selected'

export interface ExportUserSummary {
  id: number
  name: string
  email: string
  hireDate: string | null
  defaultApproverName: string | null
  granted: number
  used: number
  remaining: number
}

export interface SummarySheetRow {
  이름: string
  이메일: string
  입사일: string
  '기본 결재자': string
  '발생 연차': number
  '사용 연차': number
  '잔여 연차': number
}

export function buildSummarySheetRows(users: ExportUserSummary[]): SummarySheetRow[] {
  return users.map((u) => ({
    이름: u.name,
    이메일: u.email,
    입사일: u.hireDate ?? '-',
    '기본 결재자': u.defaultApproverName ?? '-',
    '발생 연차': u.granted,
    '사용 연차': u.used,
    '잔여 연차': u.remaining,
  }))
}

export interface HistorySheetRow {
  이름: string
  이메일: string
  구분: string
  일시: string
  내용: string
  사유: string
  처리자: string
}

export function buildHistorySheetRows(
  entries: { name: string; email: string; history: HistoryEntry[] }[]
): HistorySheetRow[] {
  return entries.flatMap((e) =>
    e.history.map((h) => ({
      이름: e.name,
      이메일: e.email,
      구분: h.category,
      일시: h.date,
      내용: h.detail,
      사유: h.reason,
      처리자: h.actorName ?? '-',
    }))
  )
}

export function buildExportFilename(params: {
  mode: ExportMode
  users: { name: string }[]
  today: string
}): string {
  const { mode, users, today } = params
  if (mode === 'selected' && users.length === 1) {
    return `프리랜서_연차정보_${users[0].name}_${today}.xlsx`
  }
  if (mode === 'selected') {
    return `프리랜서_연차정보_선택_${today}.xlsx`
  }
  if (mode === 'mine') {
    return `프리랜서_연차정보_담당_${today}.xlsx`
  }
  return `프리랜서_연차정보_전체_${today}.xlsx`
}
