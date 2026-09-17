# 대시보드 UI 개선 구현 플랜

> **에이전트 작업자에게:** 이 플랜은 `executing-plans` 스킬로 태스크 단위로 실행한다.
> 각 태스크 완료 후 커밋하며, 커밋 메시지는 한국어로 작성한다.

## 1. 개요

대시보드의 가로 늘어짐 현상을 방지하기 위해 컨테이너 최대 너비(`max-w-5xl`)를 설정하고, 텍스트 위주의 단순 카드를 Lucide 아이콘, 강조 수치, 차별화된 Accent 컬러 및 퀵 액션 버튼이 적용된 시각적으로 우수한 Stat Cards로 개편한다.

---

## 2. 파일 구조

| 파일 | 동작 | 책임 |
|------|------|------|
| `components/dashboard/freelancer-dashboard.tsx` | 수정 | 프리랜서 휴가 현황 Stat Cards & 퀵 액션 버트 개선 |
| `components/dashboard/approver-summary-box.tsx` | 수정 | 결재자 결재 현황 Stat Cards & 빠른 결재함 이동 개선 |
| `components/dashboard/admin-dashboard.tsx` | 수정 | 최고관리자 전체 현황 Stat Cards & 가입 승인 대기 강조 배너 개선 |
| `app/dashboard/page.tsx` | 수정 | 대시보드 레이아웃 콤팩트화 (`max-w-5xl mx-auto`) 및 헤더 개선 |

---

## 3. 태스크 목록

### 태스크 1: 프리랜서 대시보드 UI 개편 (`components/dashboard/freelancer-dashboard.tsx`)
- **목표**: 발생/사용/잔여/결재대기 4가지 핵심 지표를 아이콘과 컬러 강조가 적용된 그리드 Stat Cards로 개편한다.
- **스텝**:
  1. `components/dashboard/freelancer-dashboard.tsx` 수정 (Lucide 아이콘 `CalendarIcon`, `ClockIcon`, `CheckCircle2Icon`, `FileTextIcon` 적용, 잔여 연차 음수/양수 색상 다원화, 퀵 버튼 배치)
  2. `tsc --noEmit` 확인
  3. 커밋: `style: 프리랜서 대시보드 Stat Cards UI 및 퀵 액션 개편`

---

### 태스크 2: 결재자 요약 상자 UI 개편 (`components/dashboard/approver-summary-box.tsx`)
- **목표**: 결재 대기, 처리 완료, 담당 프리랜서 현황 카드를 아이콘과 대기 강조 스타일이 적용된 Stat Cards로 개선한다.
- **스텝**:
  1. `components/dashboard/approver-summary-box.tsx` 수정 (`InboxIcon`, `CheckCircle2Icon`, `UsersIcon` 적용, 결재 대기 > 0 시 뱃지 및 액션 버튼 강조)
  2. `tsc --noEmit` 확인
  3. 커밋: `style: 결재자 요약 대시보드 Stat Cards UI 개편`

---

### 태스크 3: 최고관리자 대시보드 UI 개편 (`components/dashboard/admin-dashboard.tsx`)
- **목표**: 전체 현황(재직 프리랜서, 결재자 수) 카드를 아이콘 Stat Cards로 교체하고, 가입 승인 대기 알림 배너 디자인을 개선한다.
- **스텝**:
  1. `components/dashboard/admin-dashboard.tsx` 수정 (`UserCheckIcon`, `ShieldCheckIcon`, `UserPlusIcon` 활용)
  2. `tsc --noEmit` 확인
  3. 커밋: `style: 최고관리자 대시보드 현황 및 가입 대기 배너 UI 개편`

---

### 태스크 4: 대시보드 메인 레이아웃 콤팩트화 (`app/dashboard/page.tsx`)
- **목표**: 대시보드 최상위 컨테이너를 `max-w-5xl mx-auto`로 제한하여 대형 모니터에서의 가로 늘어짐을 방지하고 여백과 헤더를 정돈한다.
- **스텝**:
  1. `app/dashboard/page.tsx` 수정
  2. `tsc --noEmit` 확인
  3. 커밋: `style: 대시보드 메인 페이지 레이아웃 콤팩트화`

---

## 4. 수동 QA 체크리스트
- [ ] 프리랜서/결재자/관리자 각 역할별로 대시보드 접속 시 가로 늘어짐 없이 중앙에 콤팩트하게 보이는지 확인
- [ ] 각 수치 카드에 아이콘과 테마 색상이 올바르게 표시되는지 확인
- [ ] 퀵 버튼 클릭 시 해당 페이지로 정상 이동하는지 확인
