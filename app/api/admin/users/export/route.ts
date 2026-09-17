import ExcelJS from 'exceljs'
import { NextResponse } from 'next/server'
import { requireApproverOrAbove, toAuthErrorResponse } from '@/lib/auth/session'
import { getUsersForExport } from '@/lib/db/user-export'
import { getUserHistory } from '@/lib/db/user-history'
import {
  buildExportFilename,
  buildHistorySheetRows,
  buildMonthlySheetRows,
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

    const currentYear = new Date().getFullYear()

    const users = await getUsersForExport({ mode, ids, callerId })
    const historyByUser = await Promise.all(users.map((u) => getUserHistory(u.id)))

    const summaryRows = buildSummarySheetRows(users)
    const monthlyRows = buildMonthlySheetRows(users, historyByUser, currentYear)
    const historyRows = buildHistorySheetRows(
      users.map((u, i) => ({ name: u.name, email: u.email, history: historyByUser[i] }))
    )

    const workbook = new ExcelJS.Workbook()
    workbook.creator = '프리랜서 휴가관리 시스템'
    workbook.created = new Date()

    // 1. 요약 시트 (전체 연차 현황)
    const summarySheet = workbook.addWorksheet('연차 현황 요약')
    const summaryColumns = [
      { header: '이름', key: '이름', width: 16 },
      { header: '이메일', key: '이메일', width: 28 },
      { header: '입사일', key: '입사일', width: 14 },
      { header: '기본 결재자', key: '기본 결재자', width: 16 },
      { header: '발생 연차', key: '발생 연차', width: 14 },
      { header: '사용 연차', key: '사용 연차', width: 14 },
      { header: '잔여 연차', key: '잔여 연차', width: 14 },
    ]
    summarySheet.columns = summaryColumns

    // 요약 시트 헤더 스타일링
    const summaryHeaderRow = summarySheet.getRow(1)
    summaryHeaderRow.height = 28
    summaryHeaderRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '1E293B' },
      }
      cell.font = {
        name: 'Malgun Gothic',
        size: 11,
        bold: true,
        color: { argb: 'FFFFFF' },
      }
      cell.alignment = { vertical: 'middle', horizontal: 'center' }
      cell.border = {
        top: { style: 'thin', color: { argb: '475569' } },
        bottom: { style: 'medium', color: { argb: '0F172A' } },
        left: { style: 'thin', color: { argb: '475569' } },
        right: { style: 'thin', color: { argb: '475569' } },
      }
    })

    // 요약 시트 데이터 행 추가 및 스타일 적용
    summaryRows.forEach((row, idx) => {
      const addedRow = summarySheet.addRow(row)
      addedRow.height = 24
      const isEven = idx % 2 === 1

      addedRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.font = { name: 'Malgun Gothic', size: 10 }
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: isEven ? 'F8FAFC' : 'FFFFFF' },
        }
        cell.border = {
          top: { style: 'thin', color: { argb: 'E2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'E2E8F0' } },
          left: { style: 'thin', color: { argb: 'E2E8F0' } },
          right: { style: 'thin', color: { argb: 'E2E8F0' } },
        }

        if (colNumber === 1 || colNumber === 3 || colNumber === 4) {
          cell.alignment = { vertical: 'middle', horizontal: 'center' }
        } else if (colNumber === 2) {
          cell.alignment = { vertical: 'middle', horizontal: 'left' }
        } else if (colNumber >= 5 && colNumber <= 7) {
          cell.alignment = { vertical: 'middle', horizontal: 'right' }
          cell.numFmt = '0.0"일"'
        }
      })
    })

    // 요약 시트 합계 행 추가 및 스타일링
    if (summaryRows.length > 0) {
      const totalRowIndex = summaryRows.length + 2
      const totalGranted = summaryRows.reduce((acc, r) => acc + r['발생 연차'], 0)
      const totalUsed = summaryRows.reduce((acc, r) => acc + r['사용 연차'], 0)
      const totalRemaining = summaryRows.reduce((acc, r) => acc + r['잔여 연차'], 0)

      const totalRow = summarySheet.addRow({
        이름: '합계',
        이메일: '',
        입사일: '',
        '기본 결재자': '',
        '발생 연차': totalGranted,
        '사용 연차': totalUsed,
        '잔여 연차': totalRemaining,
      })
      totalRow.height = 26

      totalRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.font = { name: 'Malgun Gothic', size: 10, bold: true }
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'F1F5F9' },
        }
        cell.border = {
          top: { style: 'thin', color: { argb: '94A3B8' } },
          bottom: { style: 'double', color: { argb: '475569' } },
          left: { style: 'thin', color: { argb: 'E2E8F0' } },
          right: { style: 'thin', color: { argb: 'E2E8F0' } },
        }

        if (colNumber === 1) {
          cell.alignment = { vertical: 'middle', horizontal: 'center' }
        } else if (colNumber >= 5 && colNumber <= 7) {
          cell.alignment = { vertical: 'middle', horizontal: 'right' }
          cell.numFmt = '0.0"일"'
        }
      })

      // 합계 레이블 셀 병합 (A열 ~ D열)
      summarySheet.mergeCells(`A${totalRowIndex}:D${totalRowIndex}`)
    }

    // 2. 월별 연차 사용 현황 시트 (1월 ~ 12월 매트릭스)
    const monthlySheet = workbook.addWorksheet(`${currentYear}년 월별 사용 현황`)
    const monthlyColumns = [
      { header: '이름', key: '이름', width: 16 },
      { header: '이메일', key: '이메일', width: 28 },
      { header: '입사일', key: '입사일', width: 14 },
      { header: '1월', key: '1월', width: 10 },
      { header: '2월', key: '2월', width: 10 },
      { header: '3월', key: '3월', width: 10 },
      { header: '4월', key: '4월', width: 10 },
      { header: '5월', key: '5월', width: 10 },
      { header: '6월', key: '6월', width: 10 },
      { header: '7월', key: '7월', width: 10 },
      { header: '8월', key: '8월', width: 10 },
      { header: '9월', key: '9월', width: 10 },
      { header: '10월', key: '10월', width: 10 },
      { header: '11월', key: '11월', width: 10 },
      { header: '12월', key: '12월', width: 10 },
      { header: '총 사용', key: '합계', width: 12 },
    ]
    monthlySheet.columns = monthlyColumns

    // 월별 시트 헤더 스타일링
    const monthlyHeaderRow = monthlySheet.getRow(1)
    monthlyHeaderRow.height = 28
    monthlyHeaderRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '1E293B' },
      }
      cell.font = {
        name: 'Malgun Gothic',
        size: 11,
        bold: true,
        color: { argb: 'FFFFFF' },
      }
      cell.alignment = { vertical: 'middle', horizontal: 'center' }
      cell.border = {
        top: { style: 'thin', color: { argb: '475569' } },
        bottom: { style: 'medium', color: { argb: '0F172A' } },
        left: { style: 'thin', color: { argb: '475569' } },
        right: { style: 'thin', color: { argb: '475569' } },
      }
    })

    // 월별 시트 데이터 행 추가 및 스타일 적용
    monthlyRows.forEach((row, idx) => {
      const addedRow = monthlySheet.addRow(row)
      addedRow.height = 24
      const isEven = idx % 2 === 1

      addedRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.font = { name: 'Malgun Gothic', size: 10 }
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: isEven ? 'F8FAFC' : 'FFFFFF' },
        }
        cell.border = {
          top: { style: 'thin', color: { argb: 'E2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'E2E8F0' } },
          left: { style: 'thin', color: { argb: 'E2E8F0' } },
          right: { style: 'thin', color: { argb: 'E2E8F0' } },
        }

        if (colNumber === 1 || colNumber === 3) {
          cell.alignment = { vertical: 'middle', horizontal: 'center' }
        } else if (colNumber === 2) {
          cell.alignment = { vertical: 'middle', horizontal: 'left' }
        } else if (colNumber >= 4) {
          cell.alignment = { vertical: 'middle', horizontal: 'right' }
          const val = typeof cell.value === 'number' ? cell.value : 0
          if (val > 0) {
            cell.numFmt = '0.0"일"'
            cell.font = { name: 'Malgun Gothic', size: 10, bold: true, color: { argb: '0F766E' } }
          } else {
            cell.value = '-'
            cell.alignment = { vertical: 'middle', horizontal: 'center' }
            cell.font = { name: 'Malgun Gothic', size: 10, color: { argb: '94A3B8' } }
          }
        }
      })
    })

    // 월별 시트 합계 행 추가
    if (monthlyRows.length > 0) {
      const totalRowIndex = monthlyRows.length + 2
      const monthTotals = Array.from({ length: 12 }, (_, mIdx) => {
        const key = `${mIdx + 1}월` as keyof (typeof monthlyRows)[0]
        return monthlyRows.reduce((acc, r) => acc + (Number(r[key]) || 0), 0)
      })
      const grandTotal = monthlyRows.reduce((acc, r) => acc + (Number(r['합계']) || 0), 0)

      const monthlyTotalObj: Record<string, any> = {
        이름: '월별 합계',
        이메일: '',
        입사일: '',
        '1월': monthTotals[0],
        '2월': monthTotals[1],
        '3월': monthTotals[2],
        '4월': monthTotals[3],
        '5월': monthTotals[4],
        '6월': monthTotals[5],
        '7월': monthTotals[6],
        '8월': monthTotals[7],
        '9월': monthTotals[8],
        '10월': monthTotals[9],
        '11월': monthTotals[10],
        '12월': monthTotals[11],
        합계: grandTotal,
      }

      const totalRow = monthlySheet.addRow(monthlyTotalObj)
      totalRow.height = 26

      totalRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.font = { name: 'Malgun Gothic', size: 10, bold: true }
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'F1F5F9' },
        }
        cell.border = {
          top: { style: 'thin', color: { argb: '94A3B8' } },
          bottom: { style: 'double', color: { argb: '475569' } },
          left: { style: 'thin', color: { argb: 'E2E8F0' } },
          right: { style: 'thin', color: { argb: 'E2E8F0' } },
        }

        if (colNumber === 1) {
          cell.alignment = { vertical: 'middle', horizontal: 'center' }
        } else if (colNumber >= 4) {
          cell.alignment = { vertical: 'middle', horizontal: 'right' }
          const val = typeof cell.value === 'number' ? cell.value : 0
          if (val > 0) {
            cell.numFmt = '0.0"일"'
          } else {
            cell.value = '-'
            cell.alignment = { vertical: 'middle', horizontal: 'center' }
          }
        }
      })

      monthlySheet.mergeCells(`A${totalRowIndex}:C${totalRowIndex}`)
    }

    // 3. 이력 시트 (상세 이력)
    const historySheet = workbook.addWorksheet('상세 변경 이력')
    historySheet.columns = [
      { header: '이름', key: '이름', width: 16 },
      { header: '이메일', key: '이메일', width: 28 },
      { header: '구분', key: '구분', width: 16 },
      { header: '일시', key: '일시', width: 18 },
      { header: '내용', key: '내용', width: 14 },
      { header: '사유', key: '사유', width: 32 },
      { header: '처리자', key: '처리자', width: 14 },
    ]

    // 이력 시트 헤더 스타일링
    const historyHeaderRow = historySheet.getRow(1)
    historyHeaderRow.height = 28
    historyHeaderRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '1E293B' },
      }
      cell.font = {
        name: 'Malgun Gothic',
        size: 11,
        bold: true,
        color: { argb: 'FFFFFF' },
      }
      cell.alignment = { vertical: 'middle', horizontal: 'center' }
      cell.border = {
        top: { style: 'thin', color: { argb: '475569' } },
        bottom: { style: 'medium', color: { argb: '0F172A' } },
        left: { style: 'thin', color: { argb: '475569' } },
        right: { style: 'thin', color: { argb: '475569' } },
      }
    })

    // 이력 시트 데이터 행 추가 및 스타일 적용
    historyRows.forEach((row, idx) => {
      const addedRow = historySheet.addRow(row)
      addedRow.height = 24
      const isEven = idx % 2 === 1

      addedRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.font = { name: 'Malgun Gothic', size: 10 }
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: isEven ? 'F8FAFC' : 'FFFFFF' },
        }
        cell.border = {
          top: { style: 'thin', color: { argb: 'E2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'E2E8F0' } },
          left: { style: 'thin', color: { argb: 'E2E8F0' } },
          right: { style: 'thin', color: { argb: 'E2E8F0' } },
        }

        if (colNumber === 1 || colNumber === 3 || colNumber === 4 || colNumber === 7) {
          cell.alignment = { vertical: 'middle', horizontal: 'center' }
        } else if (colNumber === 5) {
          cell.alignment = { vertical: 'middle', horizontal: 'center' }
        } else {
          cell.alignment = { vertical: 'middle', horizontal: 'left' }
        }
      })
    })

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
