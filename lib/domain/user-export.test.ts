import { describe, expect, it } from 'vitest'
import { buildExportFilename, buildHistorySheetRows, buildSummarySheetRows } from './user-export'

describe('buildSummarySheetRows', () => {
  it('사용자 목록을 요약 시트 행으로 변환하고 null 값은 -으로 대체한다', () => {
    const result = buildSummarySheetRows([
      {
        id: 1,
        name: '홍길동',
        email: 'hong@example.com',
        hireDate: '2026-01-01',
        defaultApproverName: '관리자',
        granted: 5,
        used: 2,
        remaining: 3,
      },
      {
        id: 2,
        name: '김철수',
        email: 'kim@example.com',
        hireDate: null,
        defaultApproverName: null,
        granted: 0,
        used: 0,
        remaining: 0,
      },
    ])
    expect(result).toEqual([
      {
        이름: '홍길동',
        이메일: 'hong@example.com',
        입사일: '2026-01-01',
        '기본 결재자': '관리자',
        '발생 연차': 5,
        '사용 연차': 2,
        '잔여 연차': 3,
      },
      {
        이름: '김철수',
        이메일: 'kim@example.com',
        입사일: '-',
        '기본 결재자': '-',
        '발생 연차': 0,
        '사용 연차': 0,
        '잔여 연차': 0,
      },
    ])
  })
})

describe('buildHistorySheetRows', () => {
  it('여러 사용자의 이력을 이름/이메일이 붙은 평평한 행 목록으로 합친다', () => {
    const result = buildHistorySheetRows([
      {
        name: '홍길동',
        email: 'hong@example.com',
        history: [
          { category: '연차 발생', date: '2026-04-01 09:00', detail: '+1일', reason: '-', actorName: null },
        ],
      },
      {
        name: '김철수',
        email: 'kim@example.com',
        history: [
          { category: '사용', date: '2026-06-01 09:00', detail: '+1일', reason: '연차', actorName: '관리자' },
        ],
      },
    ])
    expect(result).toEqual([
      {
        이름: '홍길동',
        이메일: 'hong@example.com',
        구분: '연차 발생',
        일시: '2026-04-01 09:00',
        내용: '+1일',
        사유: '-',
        처리자: '-',
      },
      {
        이름: '김철수',
        이메일: 'kim@example.com',
        구분: '사용',
        일시: '2026-06-01 09:00',
        내용: '+1일',
        사유: '연차',
        처리자: '관리자',
      },
    ])
  })

  it('이력이 없는 사용자는 결과에 아무 행도 남기지 않는다', () => {
    const result = buildHistorySheetRows([{ name: '홍길동', email: 'hong@example.com', history: [] }])
    expect(result).toEqual([])
  })
})

describe('buildExportFilename', () => {
  it('mode가 all이면 전체 파일명을 만든다', () => {
    expect(buildExportFilename({ mode: 'all', users: [], today: '20260826' })).toBe(
      '프리랜서_연차정보_전체_20260826.xlsx'
    )
  })

  it('mode가 mine이면 담당 파일명을 만든다', () => {
    expect(buildExportFilename({ mode: 'mine', users: [], today: '20260826' })).toBe(
      '프리랜서_연차정보_담당_20260826.xlsx'
    )
  })

  it('mode가 selected이고 대상이 1명이면 이름이 들어간 파일명을 만든다', () => {
    expect(
      buildExportFilename({ mode: 'selected', users: [{ name: '홍길동' }], today: '20260826' })
    ).toBe('프리랜서_연차정보_홍길동_20260826.xlsx')
  })

  it('mode가 selected이고 대상이 여러 명이면 선택 파일명을 만든다', () => {
    expect(
      buildExportFilename({
        mode: 'selected',
        users: [{ name: '홍길동' }, { name: '김철수' }],
        today: '20260826',
      })
    ).toBe('프리랜서_연차정보_선택_20260826.xlsx')
  })
})
