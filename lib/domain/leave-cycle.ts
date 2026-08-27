import { differenceInCalendarMonths, parseISO } from 'date-fns'
import { addMonthsISO, isBeforeDate, isOnOrAfterDate } from './date-utils'

export interface LeaveCycle {
  cycleIndex: number
  start: string
  end: string
}

export function getCurrentCycle(hireDate: string, asOfDate: string): LeaveCycle {
  let cycleIndex = 0
  while (isOnOrAfterDate(asOfDate, addMonthsISO(hireDate, (cycleIndex + 1) * 12))) {
    cycleIndex++
  }
  return {
    cycleIndex,
    start: addMonthsISO(hireDate, cycleIndex * 12),
    end: addMonthsISO(hireDate, (cycleIndex + 1) * 12),
  }
}

export function getMonthlyEvaluationPeriod(hireDate: string, monthIndex: number) {
  return {
    start: addMonthsISO(hireDate, monthIndex - 1),
    end: addMonthsISO(hireDate, monthIndex),
  }
}

export function getMonthlyAnniversaryIndex(hireDate: string, date: string): number | null {
  const diff = differenceInCalendarMonths(parseISO(date), parseISO(hireDate))
  if (diff < 1) return null
  return addMonthsISO(hireDate, diff) === date ? diff : null
}

export interface MonthlyEvaluationPeriod {
  monthIndex: number
  start: string
  end: string
}

// 관리자가 예외를 등록할 때 "그 달에 속하는 아무 날짜"를 고르면, 그 날짜가 속한 평가월(입사일
// 기준 앵커링)의 시작일을 역산하기 위한 함수. date는 hireDate 이후여야 한다(그 이전 날짜를
// 넘기면 monthIndex=1로 수렴한다 — 이 프로젝트에서는 호출부가 항상 hireDate 이후 날짜만 넘긴다).
//
// 경계일(예: hireDate + N개월)은 N번째 평가월에 속한다 — getMonthlyAnniversaryIndex(배치가 "오늘
// 발생시킬 monthIndex"를 판정하는 함수)와 기준을 맞추기 위함이다. isOnOrAfterDate(포함 비교)로
// 다음 monthIndex로 넘겨버리면, 관리자가 자동 발생 배치가 도는 "오늘" 날짜로 만근 예외를 등록해도
// 실제로는 다음 평가월에 등록되어 당일 발생을 막지 못하는 버그가 생긴다.
export function findMonthlyEvaluationPeriod(hireDate: string, date: string): MonthlyEvaluationPeriod {
  let monthIndex = 1
  while (isBeforeDate(addMonthsISO(hireDate, monthIndex), date)) {
    monthIndex++
  }
  return { monthIndex, ...getMonthlyEvaluationPeriod(hireDate, monthIndex) }
}
