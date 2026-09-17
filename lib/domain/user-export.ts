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

export interface MonthlySheetRow {
  이름: string
  이메일: string
  입사일: string
  '1월': number
  '2월': number
  '3월': number
  '4월': number
  '5월': number
  '6월': number
  '7월': number
  '8월': number
  '9월': number
  '10월': number
  '11월': number
  '12월': number
  '합계': number
}

export function buildMonthlySheetRows(
  users: ExportUserSummary[],
  historyByUser: HistoryEntry[][],
  targetYear?: number
): MonthlySheetRow[] {
  const currentYear = new Date().getFullYear()
  const yearStr = String(targetYear ?? currentYear)

  return users.map((u, i) => {
    const history = historyByUser[i] ?? []
    const usageByMonth = Array.from({ length: 12 }, () => 0)

    for (const h of history) {
      if (h.category === '사용' && h.date.startsWith(yearStr)) {
        const monthNum = parseInt(h.date.slice(5, 7), 10)
        if (monthNum >= 1 && monthNum <= 12) {
          const num = parseFloat(h.detail.replace(/[^0-9.-]/g, ''))
          usageByMonth[monthNum - 1] += isNaN(num) ? 0 : Math.abs(num)
        }
      }
    }

    const yearTotal = usageByMonth.reduce((a, b) => a + b, 0)

    return {
      이름: u.name,
      이메일: u.email,
      입사일: u.hireDate ?? '-',
      '1월': usageByMonth[0],
      '2월': usageByMonth[1],
      '3월': usageByMonth[2],
      '4월': usageByMonth[3],
      '5월': usageByMonth[4],
      '6월': usageByMonth[5],
      '7월': usageByMonth[7 - 1],
      '8월': usageByMonth[8 - 1],
      '9월': usageByMonth[9 - 1],
      '10월': usageByMonth[10 - 1],
      '11월': usageByMonth[11 - 1],
      '12월': usageByMonth[12 - 1],
      합계: yearTotal,
    }
  })
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
