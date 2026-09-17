# 캘린더 뷰 (Calendar View) 화면 및 서브시스템 설계 문서

- 작성일: 2026-09-17
- 상태: 승인 대기
- 기준 문서: `docs/superpowers/specs/2026-08-24-freelancer-leave-management-design.md`

---

## 1. 배경 및 목적

현재 시스템은 목록(테이블) 형태로만 휴가 신청 내역 및 결재함을 제공하고 있어, 특정 월의 일정 및 팀원 간의 휴가 중복 여부를 시각적으로 파악하기 어렵다.
승인된 휴가 일정과 법정/공휴일을 월간 달력(Monthly Grid) 형태로 시각화하는 **캘린더 뷰 (`/calendar`)** 서브시스템을 구축한다.

---

## 2. 화면 범위

- **라우트**: `/calendar`
- **접근 권한**: 로그인된 모든 승인 사용자 (`FREELANCER`, `APPROVER`, `SUPER_ADMIN`)
- **GNB 메뉴**: 헤더 네비게이션에 "캘린더" 아이콘 및 링크 추가

---

## 3. 주요 기능 및 UI 구성

### 3.1 상단 툴바 (Toolbar)
- **월 이동 컨트롤**: `[< 이전달]` `[2026년 9월]` `[다음달 >]` `[오늘]` 버튼
- **보기 필터 (Filter)**: `[전체 일정]` / `[내 휴가만]` 탭 또는 토글
- **범례 (Legend)**: 공휴일(빨간색), 연차(파란색/Primary), 반차(오렌지/Amber) 구분 표식

### 3.2 월간 그리드 (Monthly Grid)
- 7열(일~토) 형태의 전통적인 월간 달력 그리드.
- **주말 및 공휴일 표시**:
  - 일요일 및 공휴일(`Holidays` 테이블): 붉은색 배경 및 공휴일 명칭 뱃지
  - 토요일: 은은한 슬레이트/푸른색 타일
  - 오늘 날짜: 테두리 및 원형 하이라이트
- **휴가 이벤트 바/칩 (Event Chip)**:
  - 시작일~종료일에 맞춰 달력 셀 내 바(Bar) 형태로 표출
  - 표시 항목: `[신청자명] 제목 (유형)`
  - 연차(FULL): 셀 전체 기간 연결 바
  - 반차(AM_HALF / PM_HALF): `오전반차` / `오후반차` 구분 뱃지

### 3.3 휴가 상세 모달/팝오버 (Event Detail)
- 이벤트 바 클릭 시 팝오버 또는 다이얼로그 노출:
  - 신청자명, 휴가 제목, 기간(시작일~종료일), 휴가 유형, 신청 사유

---

## 4. API 엔드포인트

### `GET /api/calendar`
- **쿼리 파라미터**:
  - `year`: 년도 (예: `2026`)
  - `month`: 월 (예: `9`)
  - `filter`: `all` (전체) | `mine` (본인) - 기본값 `all`
- **응답 형식**:
```json
{
  "events": [
    {
      "id": 10,
      "title": "여름 휴가",
      "requesterId": 2,
      "requesterName": "홍길동",
      "type": "FULL",
      "startDate": "2026-09-10",
      "endDate": "2026-09-12",
      "requestedDays": 3,
      "isMine": true
    }
  ],
  "holidays": [
    {
      "id": 1,
      "date": "2026-09-15",
      "name": "추석",
      "isRecurring": false
    }
  ]
}
```

- **권한 및 데이터 범위**:
  - `SUPER_ADMIN`: 전체 승인된 휴가 조회
  - `APPROVER`: 본인 담당 프리랜서 + 본인의 승인된 휴가 조회 (filter=mine 선택 시 본인 건만)
  - `FREELANCER`: 승인된 휴가 전체 조회 (filter=mine 선택 시 본인 건만)

---

## 5. 데이터 계층 및 DB 쿼리

새로운 테이블 생성 없이 기존 `leave_requests`, `users`, `holidays` 테이블을 활용한다.

- `leave_requests` 조건: `status = 'APPROVED'` AND `type != 'ADJUSTMENT'` AND `(startDate <= monthEnd AND endDate >= monthStart)`

---

## 6. 컴포넌트 구조

```
app/
  calendar/
    page.tsx                 # 캘린더 메인 페이지
  api/
    calendar/
      route.ts               # 캘린더 이벤트/공휴일 조회 API
components/
  calendar/
    calendar-toolbar.tsx     # 이전/다음월, 오늘, 필터 툴바
    monthly-calendar-grid.tsx # 7열 그리드 및 이벤트 바 렌더링
    calendar-event-dialog.tsx # 이벤트 상세 팝오버/다이얼로그
```

---

## 7. 테스트 방향

- API 단위 검증: 특정 월 범위에 걸치는 휴가(월 이월 포함)가 올바르게 쿼리되는지 검증
- 권한 검증: 승인되지 않은 휴가(`PENDING`, `DRAFT`, `REJECTED`)는 캘린더에 노출되지 않음을 확인
- 수동 QA: 2x2/모바일 화면에서 캘린더 스크롤 및 이벤트 오버플로우 처리 확인

---

## 8. 이번 범위에서 제외
- 캘린더 상에서 드래그 앤 드롭으로 휴가 신청하기 (신청은 기존 내 문서 Sheet 사용)
- 주간(Weekly) / 일간(Daily) 뷰 전환 (월간 뷰 우선 구축)
