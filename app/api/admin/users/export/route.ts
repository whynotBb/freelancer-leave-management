import ExcelJS from 'exceljs'
import { NextResponse } from 'next/server'
import { requireApproverOrAbove, toAuthErrorResponse } from '@/lib/auth/session'
import { getUsersForExport } from '@/lib/db/user-export'
import { getUserHistory } from '@/lib/db/user-history'
import {
  buildExportFilename,
  buildHistorySheetRows,
  buildSummarySheetRows,
  type ExportMode,
} from '@/lib/domain/user-export'

const KST_OFFSET_MS = 9 * 60 * 60 * 1000

function todayKst(): string {
  const kst = new Date(Date.now() + KST_OFFSET_MS)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${kst.getUTCFullYear()}${pad(kst.getUTCMonth() + 1)}${pad(kst.getUTCDate())}`
}

export async function GET(request: Request) {
  try {
    const session = await requireApproverOrAbove()
    const callerId = Number((session.user as { id?: string }).id)

    const { searchParams } = new URL(request.url)
    const modeParam = searchParams.get('mode')
    if (modeParam !== 'all' && modeParam !== 'mine' && modeParam !== 'selected') {
      return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
    }
    const mode: ExportMode = modeParam

    let ids: number[] | undefined
    if (mode === 'selected') {
      ids = (searchParams.get('ids') ?? '')
        .split(',')
        .map((v) => Number(v))
        .filter((n) => Number.isInteger(n) && n > 0)
      if (ids.length === 0) {
        return NextResponse.json({ error: '선택된 항목이 없습니다.' }, { status: 400 })
      }
    }

    const users = await getUsersForExport({ mode, ids, callerId })
    const historyByUser = await Promise.all(users.map((u) => getUserHistory(u.id)))

    const summaryRows = buildSummarySheetRows(users)
    const historyRows = buildHistorySheetRows(
      users.map((u, i) => ({ name: u.name, email: u.email, history: historyByUser[i] }))
    )

    const workbook = new ExcelJS.Workbook()

    const summarySheet = workbook.addWorksheet('요약')
    summarySheet.columns = [
      { header: '이름', key: '이름', width: 16 },
      { header: '이메일', key: '이메일', width: 32 },
      { header: '입사일', key: '입사일', width: 14 },
      { header: '기본 결재자', key: '기본 결재자', width: 16 },
      { header: '발생 연차', key: '발생 연차', width: 12 },
      { header: '사용 연차', key: '사용 연차', width: 12 },
      { header: '잔여 연차', key: '잔여 연차', width: 12 },
    ]
    summarySheet.addRows(summaryRows)

    const historySheet = workbook.addWorksheet('이력')
    historySheet.columns = [
      { header: '이름', key: '이름', width: 16 },
      { header: '이메일', key: '이메일', width: 32 },
      { header: '구분', key: '구분', width: 14 },
      { header: '일시', key: '일시', width: 18 },
      { header: '내용', key: '내용', width: 12 },
      { header: '사유', key: '사유', width: 28 },
      { header: '처리자', key: '처리자', width: 14 },
    ]
    historySheet.addRows(historyRows)

    const buffer = await workbook.xlsx.writeBuffer()
    const filename = buildExportFilename({ mode, users, today: todayKst() })

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    })
  } catch (error) {
    const response = toAuthErrorResponse(error)
    if (response) return response
    throw error
  }
}
