# 휴가 캘린더 달력/리스트 보기 전환 기능 구현 플랜

> **에이전트 작업자에게:** 이 플랜은 `executing-plans` 스킬로 태스크 단위로 순서대로 실행합니다.
> 각 태스크 완료 후 테스트 실행 및 TDD 사이클을 준수합니다.

## 관련 요구사항
- 휴가 캘린더 화면에서 기존 달력(그리드) 보기 외에 리스트 보기 전환 기능 제공
- 선택한 연/월의 휴가 일정을 날짜 순서대로 보여주고 클릭 시 상세 모달 오픈

---

## 파일 구조

| 파일 | 동작 | 책임 |
|------|------|------|
| `lib/domain/calendar-utils.ts` | 수정 | 이벤트 날짜순 정렬 및 리스트 뷰용 데이터 변환 함수 추가 |
| `lib/domain/calendar-utils.test.ts` | 생성/수정 | 캘린더 이벤트 날짜순 정렬 단위 테스트 |
| `components/calendar/calendar-list-view.tsx` | 생성 | 선택 연/월 휴가 일정 리스트 뷰 (데스크톱 테이블 + 모바일 카드 뷰) |
| `components/calendar/calendar-toolbar.tsx` | 수정 | `viewMode` 토글 버튼 그룹 (달력 / 리스트) 추가 |
| `app/calendar/page.tsx` | 수정 | `viewMode` 상태 조율 및 조건부 렌더링 |

---

## 태스크 목록

### 태스크 1: 캘린더 이벤트 날짜순 정렬 도메인 로직 및 단위 테스트
**목표:** 캘린더 이벤트를 시작일 기준 오름차순 정렬하는 `sortCalendarEvents` 함수 추가 및 검증

**스텝:**
1. `lib/domain/calendar-utils.ts`에 `sortCalendarEvents(events: CalendarEventRow[]): CalendarEventRow[]` 함수 추가
2. `lib/domain/calendar-utils.test.ts` 작성 및 테스트 작성
3. 테스트 실행: `npx vitest run lib/domain/calendar-utils.test.ts`

---

### 태스크 2: `CalendarListView` 컴포넌트 구현
**목표:** 선택 월의 휴가 목록을 날짜순으로 렌더링하고 클릭 시 상세 모달을 띄우는 리스트 뷰 작성

**스텝:**
1. `components/calendar/calendar-list-view.tsx` 생성
2. 날짜, 신청자, 유형(연차/오전반차/오후반차 뱃지), 사유, 결재자 컬럼 구성
3. 당월 휴가가 없을 시 Empty State 표출
4. 모바일 뷰포트 대응 카드 레이아웃 적용

---

### 태스크 3: `CalendarToolbar` 토글 버튼 추가
**목표:** `viewMode` (`'calendar'` | `'list'`) 전환 Segmented Toggle 버튼 구현

**스텝:**
1. `CalendarToolbarProps`에 `viewMode`, `onViewModeChange` 추가
2. Lucide icons (`LayoutGridIcon`, `ListIcon`)을 사용한 토글 버튼 그룹 추가

---

### 태스크 4: `CalendarPage` 메인 페이지 연동 및 통합 테스트
**목표:** 메인 페이지에서 `viewMode` 상태 조율 및 타입 검증 / 회귀 테스트

**스텝:**
1. `app/calendar/page.tsx`에 `viewMode` state 추가
2. `viewMode === 'calendar'` ➔ `MonthlyCalendarGrid`, `viewMode === 'list'` ➔ `CalendarListView` 조건부 렌더링
3. 타입 검증: `npx tsc --noEmit`
4. 전체 테스트 실행: `npx vitest run`

---

## 수동 QA 체크리스트
- [ ] 캘린더 상단 툴바의 [달력] / [리스트] 토글 버튼 클릭 시 정상 전환
- [ ] 리스트 뷰에서 선택한 연/월의 승인된 휴가가 날짜순 정렬 표출
- [ ] 리스트 항목 클릭 시 휴가 상세 모달(`CalendarEventDialog`) 정상 팝업
- [ ] 휴가 일정이 없는 달 선택 시 Empty State ("해당 월에 등록된 휴가 일정이 없습니다") 표출
- [ ] 모바일 뷰포트(375px)에서 리스트 뷰 카드 레이아웃 깨짐 없이 표출
