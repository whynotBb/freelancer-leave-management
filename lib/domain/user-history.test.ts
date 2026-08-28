import { describe, expect, it } from 'vitest'
import { buildHistoryTimeline, paginateHistory, type HistoryEntry } from './user-history'

describe('buildHistoryTimeline', () => {
  it('createdBy가 없는 leaveGrants 행은 "연차 자동 발생"으로 분류하고 양수 금액에 +를 붙이며 처리자를 "시스템"으로 표시한다', () => {
    const result = buildHistoryTimeline({
      grants: [
        {
          grantDate: '2026-04-01',
          amount: 1,
          note: null,
          createdBy: null,
          createdByName: null,
          createdAt: '2026-04-01T00:00:00.000Z',
        },
      ],
      usages: [],
      approverChanges: [],
    })
    expect(result).toEqual([
      {
        category: '연차 자동 발생',
        date: '2026-04-01 09:00',
        detail: '+1일',
        reason: '-',
        actorName: '시스템',
      },
    ])
  })

  it('createdBy가 있는 leaveGrants 행은 "연차 조정"으로 분류한다', () => {
    const result = buildHistoryTimeline({
      grants: [
        {
          grantDate: '2026-05-01',
          amount: -2,
          note: '초과 지급 보정',
          createdBy: 1,
          createdByName: '관리자',
          createdAt: '2026-05-01T09:00:00.000Z',
        },
      ],
      usages: [],
      approverChanges: [],
    })
    expect(result).toEqual([
      {
        category: '연차 조정',
        date: '2026-05-01 18:00',
        detail: '-2일',
        reason: '초과 지급 보정',
        actorName: '관리자',
      },
    ])
  })

  it('연차 조정 금액이 양수이면 detail에 +를 붙인다', () => {
    const result = buildHistoryTimeline({
      grants: [
        {
          grantDate: '2026-05-02',
          amount: 3,
          note: '포상 휴가',
          createdBy: 1,
          createdByName: '관리자',
          createdAt: '2026-05-02T09:30:00.000Z',
        },
      ],
      usages: [],
      approverChanges: [],
    })
    expect(result[0].detail).toBe('+3일')
  })

  it('createdBy가 있고 amount가 0인 leaveGrants 행은 "입사일 변경"으로 분류하고 detail은 "-"이다', () => {
    const result = buildHistoryTimeline({
      grants: [
        {
          grantDate: '2026-05-01',
          amount: 0,
          note: '입사일 수정',
          createdBy: 1,
          createdByName: '관리자',
          createdAt: '2026-05-01T09:00:00.000Z',
        },
      ],
      usages: [],
      approverChanges: [],
    })
    expect(result).toEqual([
      {
        category: '입사일 변경',
        date: '2026-05-01 18:00',
        detail: '-',
        reason: '입사일 수정',
        actorName: '관리자',
      },
    ])
  })

  it("type이 'ADJUSTMENT'인 leaveRequests 행은 \"연차 조정\"으로 분류하고 양수 금액에 +를 붙인다", () => {
    const result = buildHistoryTimeline({
      grants: [],
      usages: [
        {
          startDate: '2026-06-01',
          requestedDays: 3,
          reason: '수기 기록 반영',
          type: 'ADJUSTMENT',
          approverName: '관리자',
          createdAt: '2026-06-01T09:15:00.000Z',
        },
      ],
      approverChanges: [],
    })
    expect(result[0].category).toBe('연차 조정')
    expect(result[0].date).toBe('2026-06-01 18:15')
    expect(result[0].detail).toBe('+3일')
  })

  it("type이 'FULL'인 leaveRequests 행은 \"사용\"으로 분류한다", () => {
    const result = buildHistoryTimeline({
      grants: [],
      usages: [
        {
          startDate: '2026-06-10',
          requestedDays: 1,
          reason: '연차',
          type: 'FULL',
          approverName: '관리자',
          createdAt: '2026-06-10T09:00:00.000Z',
        },
      ],
      approverChanges: [],
    })
    expect(result[0].category).toBe('사용')
  })

  it('결재자 변경 행은 "결재자 변경"으로 분류하고 이전→이후 형식으로 표시하며 날짜에 시간을 포함한다', () => {
    const result = buildHistoryTimeline({
      grants: [],
      usages: [],
      approverChanges: [
        {
          createdAt: '2026-07-01T09:05:00.000Z',
          beforeApproverName: null,
          afterApproverName: '김결재',
          reason: '신규 배정',
          changedByName: '관리자',
        },
      ],
    })
    expect(result[0]).toEqual({
      category: '결재자 변경',
      date: '2026-07-01 18:05',
      detail: '미지정 → 김결재',
      reason: '신규 배정',
      actorName: '관리자',
    })
  })

  it('UTC 자정 무렵 시각은 KST 기준으로 날짜가 넘어간다', () => {
    const result = buildHistoryTimeline({
      grants: [],
      usages: [],
      approverChanges: [
        {
          createdAt: '2026-07-01T16:30:00.000Z',
          beforeApproverName: '김결재',
          afterApproverName: '이결재',
          reason: '야간 재배정',
          changedByName: '관리자',
        },
      ],
    })
    expect(result[0].date).toBe('2026-07-02 01:30')
  })

  it('네 출처를 합쳐 createdAt 기준 내림차순으로 정렬한다', () => {
    const result = buildHistoryTimeline({
      grants: [
        {
          grantDate: '2026-04-01',
          amount: 1,
          note: null,
          createdBy: null,
          createdByName: null,
          createdAt: '2026-04-01T00:00:00.000Z',
        },
      ],
      usages: [
        {
          startDate: '2026-06-01',
          requestedDays: 1,
          reason: '연차',
          type: 'FULL',
          approverName: '관리자',
          createdAt: '2026-06-01T00:00:00.000Z',
        },
      ],
      approverChanges: [
        {
          createdAt: '2026-05-01T00:00:00.000Z',
          beforeApproverName: null,
          afterApproverName: '김결재',
          reason: '신규 배정',
          changedByName: '관리자',
        },
      ],
      exceptions: [
        {
          periodStart: '2026-07-01',
          reason: '결근',
          createdByName: '관리자',
          createdAt: '2026-07-01T00:00:00.000Z',
        },
      ],
    })
    expect(result.map((r) => r.category)).toEqual(['만근 예외', '사용', '결재자 변경', '연차 자동 발생'])
  })

  it('만근 예외 행은 "만근 예외"로 분류하고 평가월 구간을 detail에 표시한다', () => {
    const result = buildHistoryTimeline({
      grants: [],
      usages: [],
      approverChanges: [],
      exceptions: [
        {
          periodStart: '2026-08-25',
          reason: '개인 사정으로 결근',
          createdByName: '관리자',
          createdAt: '2026-08-20T09:00:00.000Z',
        },
      ],
    })
    expect(result).toEqual([
      {
        category: '만근 예외',
        date: '2026-08-20 18:00',
        detail: '2026-08-25 ~ 2026-09-25 미발생',
        reason: '개인 사정으로 결근',
        actorName: '관리자',
      },
    ])
  })

  it('exceptions를 생략해도 기존 호출부와 동일하게 동작한다', () => {
    const result = buildHistoryTimeline({ grants: [], usages: [], approverChanges: [] })
    expect(result).toEqual([])
  })

  it('SIGNUP_APPROVED(FREELANCER) 행은 "가입 승인"으로 분류하고 detail에 입사일을 포함한다', () => {
    const result = buildHistoryTimeline({
      grants: [],
      usages: [],
      approverChanges: [],
      accountEvents: [
        {
          action: 'SIGNUP_APPROVED',
          role: 'FREELANCER',
          hireDate: '2026-08-28',
          reason: null,
          actorName: '관리자',
          createdAt: '2026-08-28T00:30:00.000Z',
        },
      ],
    })
    expect(result).toEqual([
      {
        category: '가입 승인',
        date: '2026-08-28 09:30',
        detail: '프리랜서 승인 (입사일 2026-08-28)',
        reason: '-',
        actorName: '관리자',
        targetUserId: undefined,
        targetUserName: undefined,
      },
    ])
  })

  it('SIGNUP_APPROVED(APPROVER) 행은 detail이 "결재자 승인"이다', () => {
    const result = buildHistoryTimeline({
      grants: [],
      usages: [],
      approverChanges: [],
      accountEvents: [
        {
          action: 'SIGNUP_APPROVED',
          role: 'APPROVER',
          hireDate: null,
          reason: null,
          actorName: '관리자',
          createdAt: '2026-08-28T00:30:00.000Z',
        },
      ],
    })
    expect(result[0].category).toBe('가입 승인')
    expect(result[0].detail).toBe('결재자 승인')
  })

  it('SIGNUP_REJECTED 행은 "가입 거절"로 분류하고 detail은 "-"이다', () => {
    const result = buildHistoryTimeline({
      grants: [],
      usages: [],
      approverChanges: [],
      accountEvents: [
        {
          action: 'SIGNUP_REJECTED',
          role: null,
          hireDate: null,
          reason: null,
          actorName: '관리자',
          createdAt: '2026-08-28T01:00:00.000Z',
        },
      ],
    })
    expect(result[0]).toEqual({
      category: '가입 거절',
      date: '2026-08-28 10:00',
      detail: '-',
      reason: '-',
      actorName: '관리자',
      targetUserId: undefined,
      targetUserName: undefined,
    })
  })

  it('RESIGNED 행은 "퇴사"로 분류하고 reason에 퇴사 사유 스냅샷이 그대로 담긴다', () => {
    const result = buildHistoryTimeline({
      grants: [],
      usages: [],
      approverChanges: [],
      accountEvents: [
        {
          action: 'RESIGNED',
          role: null,
          hireDate: null,
          reason: '계약 종료',
          actorName: '관리자',
          createdAt: '2026-08-28T02:00:00.000Z',
        },
      ],
    })
    expect(result[0].category).toBe('퇴사')
    expect(result[0].reason).toBe('계약 종료')
  })

  it('targetUserId/targetUserName이 있으면 결과에 그대로 포함된다', () => {
    const result = buildHistoryTimeline({
      grants: [
        {
          grantDate: '2026-04-01',
          amount: 1,
          note: null,
          createdBy: null,
          createdByName: null,
          createdAt: '2026-04-01T00:00:00.000Z',
          targetUserId: 7,
          targetUserName: '김프리랜서',
        },
      ],
      usages: [],
      approverChanges: [],
    })
    expect(result[0].targetUserId).toBe(7)
    expect(result[0].targetUserName).toBe('김프리랜서')
  })

  it('PASSWORD_RESET 행은 "비밀번호 초기화"로 분류하고 detail은 "-"이다', () => {
    const result = buildHistoryTimeline({
      grants: [],
      usages: [],
      approverChanges: [],
      accountEvents: [
        {
          action: 'PASSWORD_RESET',
          role: null,
          hireDate: null,
          reason: null,
          actorName: '관리자',
          createdAt: '2026-08-28T03:00:00.000Z',
        },
      ],
    })
    expect(result[0]).toEqual({
      category: '비밀번호 초기화',
      date: '2026-08-28 12:00',
      detail: '-',
      reason: '-',
      actorName: '관리자',
      targetUserId: undefined,
      targetUserName: undefined,
    })
  })
})

describe('paginateHistory', () => {
  const entries: HistoryEntry[] = Array.from({ length: 5 }, (_, i) => ({
    category: i % 2 === 0 ? '연차 조정' : '만근 예외',
    date: `2026-08-0${i + 1} 09:00`,
    detail: `detail-${i}`,
    reason: '-',
    actorName: null,
  }))

  it('category 필터가 있으면 해당 카테고리만 남긴다', () => {
    const result = paginateHistory(entries, { category: '만근 예외', page: 1, pageSize: 10 })
    expect(result.total).toBe(2)
    expect(result.items.every((e) => e.category === '만근 예외')).toBe(true)
  })

  it('pageSize만큼 슬라이스하고 total은 필터링된 전체 개수를 반환한다', () => {
    const result = paginateHistory(entries, { page: 1, pageSize: 2 })
    expect(result.total).toBe(5)
    expect(result.items).toHaveLength(2)
    expect(result.page).toBe(1)
    expect(result.pageSize).toBe(2)
  })

  it('page 2는 다음 슬라이스를 반환한다', () => {
    const result = paginateHistory(entries, { page: 2, pageSize: 2 })
    expect(result.items.map((e) => e.detail)).toEqual(['detail-2', 'detail-3'])
  })
})
