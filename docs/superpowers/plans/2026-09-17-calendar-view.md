# 캘린더 뷰 (Calendar View) 구현 플랜

> **에이전트 작업자에게:** 이 플랜은 `executing-plans` 스킬로 태스크 단위로 실행한다.
> 각 태스크 완료 후 커밋하며, 커밋 메시지는 한국어로 작성한다.

## 1. 개요

승인된 휴가 신청 내역과 공휴일을 월간 달력(Monthly Grid) 형태로 한눈에 시각화하는 캘린더 서브시스템(`/calendar`)을 구축한다.

## 관련 스펙
- `docs/superpowers/specs/2026-09-17-calendar-view-design.md`

---

## 2. 파일 구조

| 파일 | 동작 | 책임 |
|------|------|------|
| `lib/domain/calendar-utils.ts` | 생성 | 특정 년/월의 달력 날짜 행렬(Grid Cell) 생성 및 날짜 범위계산 순수 함수 |
| `lib/db/calendar.ts` | 생성 | 지정된 월 범위의 승인된 휴가 및 공휴일 DB 조회 함수 |
| `app/api/calendar/route.ts` | 생성 | `GET /api/calendar` API 라우트 (권한 및 월별 이벤트/공휴일 반환) |
| `components/calendar/calendar-toolbar.tsx` | 생성 | 이전/다음월 이동, 오늘, 전체/내 휴가 필터 툴바 |
| `components/calendar/calendar-event-dialog.tsx` | 생성 | 휴가 이벤트 클릭 시 상세 정보를 보여주는 Dialog |
| `components/calendar/monthly-calendar-grid.tsx` | 생성 | 7열 월간 달력 그리드 및 공휴일/휴가 바(Bar) 렌더링 |
| `app/calendar/page.tsx` | 생성 | 캘린더 메인 페이지 컴포넌트 |
| `components/app-sidebar.tsx` | 수정 | GNB 헤더 네비게이션에 "캘린더" 아이콘/링크 추가 |

---

## 3. 태스크 목록

### 태스크 1: 캘린더 도우미 함수 및 DB 쿼리 / API 라우트 구축
- **목표**: 달력 그리드 생성 순수 함수와 `GET /api/calendar` 엔드포인트를 구축한다.
- **스텝**:
  1. `lib/domain/calendar-utils.ts` 작성 (월별 35~42개 셀 날짜 계산 및 이월 날짜 판별)
  2. `lib/db/calendar.ts` 작성 (`getCalendarData(userId, role, year, month, filter)`)
  3. `app/api/calendar/route.ts` 구현
  4. `tsc --noEmit` 확인
  5. 커밋: `feat: 캘린더 이벤트/공휴일 조회 API 및 도우미 함수 구현`

---

### 태스크 2: 캘린더 툴바 및 이벤트 상세 Dialog 구현
- **목표**: 캘린더 상단 컨트롤러(월 이동, 오늘, 필터) 및 이벤트 상세 보기 Dialog를 제작한다.
- **스텝**:
  1. `components/calendar/calendar-toolbar.tsx` 작성
  2. `components/calendar/calendar-event-dialog.tsx` 작성
  3. `tsc --noEmit` 확인
  4. 커밋: `feat: 캘린더 툴바 및 이벤트 상세 다이얼로그 컴포넌트 추가`

---

### 태스크 3: 7열 월간 달력 그리드 컴포넌트 구현
- **목표**: 공휴일, 주말, 연차/반차 이벤트 바를 표현하는 7열 달력 그리드를 구현한다.
- **스텝**:
  1. `components/calendar/monthly-calendar-grid.tsx` 작성 (공휴일 붉은 타일, 반차/연차 뱃지 바, 오늘 날짜 강조)
  2. `tsc --noEmit` 확인
  3. 커밋: `feat: 7열 월간 달력 그리드 컴포넌트 구현`

---

### 태스크 4: 캘린더 메인 페이지 구축 및 GNB 메뉴 통합
- **목표**: `/calendar` 메인 페이지를 완성하고 AppSidebar GNB 헤더에 캘린더 링크를 추가한다.
- **스텝**:
  1. `app/calendar/page.tsx` 작성
  2. `components/app-sidebar.tsx` 수정 (CalendarIcon + "캘린더" 링크 추가)
  3. `tsc --noEmit` 확인
  4. 커밋: `feat: 캘린더 메인 페이지 구축 및 GNB 메뉴 연동`

---

## 4. 수동 QA 체크리스트
- [ ] `/calendar` 접속 시 현재 월의 달력이 정상 표출되는지 확인
- [ ] 이전달/다음달/오늘 버튼 클릭 시 달력 및 이벤트 데이터가 갱신되는지 확인
- [ ] 승인된 휴가 건만 캘린더에 바 형태로 표출되는지 확인
- [ ] 공휴일(예: 추석, 개천절 등)이 붉은색 타일 및 뱃지로 표출되는지 확인
- [ ] 이벤트 바 클릭 시 휴가 상세 사유 다이얼로그가 열리는지 확인
- [ ] GNB 헤더에서 "캘린더" 클릭 시 `/calendar`로 이동하는지 확인
