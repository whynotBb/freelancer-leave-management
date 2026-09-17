# 실시간 페이지 데이터 동기화 구현 플랜

> **에이전트 작업자에게:** 이 플랜은 `executing-plans` 스킬로 태스크 단위로 실행한다.
> 각 태스크 완료 후 커밋하며, 커밋 메시지는 한국어로 작성한다.

## 1. 개요

알림(`NotificationBell` / `useNotifications`)이 수신되거나 클릭되었을 때, 사용자가 접속해 있는 페이지(내 문서, 결재함 등)의 데이터를 자동으로 재조회(`re-fetch`)하여 화면의 상태(예: '대기' -> '반려')가 실시간으로 갱신되도록 브라우저 CustomEvent 기반 동기화를 구현한다.

---

## 2. 파일 구조

| 파일 | 동작 | 책임 |
|------|------|------|
| `hooks/use-notifications.ts` | 수정 | SSE 메시지 수신 시 `app:notification-received` CustomEvent 발행 |
| `components/notification-item.tsx` | 수정 | 알림 항목 클릭 시 `app:refresh-data` CustomEvent 발행 및 현재 페이지와 같으면 강제 재조회 요청 |
| `app/documents/page.tsx` | 수정 | `LEAVE_APPROVED`, `LEAVE_REJECTED`, `LEAVE_ADJUSTED` 수신 시 및 `app:refresh-data` 발생 시 `loadDocuments()` 호출 |
| `app/approvals/page.tsx` | 수정 | `LEAVE_SUBMITTED` 수신 시 및 `app:refresh-data` 발생 시 결재 목록 재조회 |

---

## 3. 태스크 목록

### 태스크 1: SSE 커스텀 이벤트 발행 구현 (`hooks/use-notifications.ts`)
- **목표**: SSE 알림 데이터가 도착하면 DOM `window.dispatchEvent`를 통해 `app:notification-received` 이벤트를 발생시킨다.
- **스텝**:
  1. `hooks/use-notifications.ts`의 `eventSource.onmessage` 내부에서 parsed notification 데이터를 포함하는 CustomEvent 디스패치 추가
  2. `tsc --noEmit` 확인
  3. 커밋: `feat: SSE 알림 수신 시 app:notification-received 커스텀 이벤트 디스패치`

---

### 태스크 2: 알림 클릭 시 갱신 이벤트 발행 (`components/notification-item.tsx`)
- **목표**: 사용자가 알림을 클릭했을 때 현재 URL과 이동할 URL이 동일한 경우에도 데이터가 재조회되도록 `app:refresh-data` 이벤트를 디스패치한다.
- **스텝**:
  1. `components/notification-item.tsx`의 `handleClick` 함수에서 `window.dispatchEvent(new Event('app:refresh-data'))` 및 현재 pathname과 target href 비교 처리
  2. `tsc --noEmit` 확인
  3. 커밋: `feat: 알림 클릭 시 app:refresh-data 이벤트 디스패치`

---

### 태스크 3: 프리랜서 '내 문서' 페이지 동기화 (`app/documents/page.tsx`)
- **목표**: 프리랜서가 내 문서 페이지를 보고 있을 때 결재자 승인/반려/조정 알림이 오거나 알림을 클릭하면 `loadDocuments()`를 자동 호출한다.
- **스텝**:
  1. `app/documents/page.tsx`에 `useEffect` 리스너 작성 (`app:notification-received` 중 `LEAVE_APPROVED`, `LEAVE_REJECTED`, `LEAVE_ADJUSTED` 및 `app:refresh-data`)
  2. `tsc --noEmit` 확인
  3. 커밋: `feat: 내 문서 페이지 실시간 알림 이벤트 연동 및 데이터 자동 재조회`

---

### 태스크 4: '결재함' 페이지 동기화 (`app/approvals/page.tsx`)
- **목표**: 결재자가 결재함 페이지를 보고 있을 때 신규 휴가 신청(`LEAVE_SUBMITTED`) 알림이 오면 목록을 자동 재조회한다.
- **스텝**:
  1. `app/approvals/page.tsx` 구현 형태 확인 후 `app:notification-received` (`LEAVE_SUBMITTED`) 및 `app:refresh-data` 이벤트 리스너 연동
  2. `tsc --noEmit` 확인
  3. 커밋: `feat: 결재함 페이지 실시간 알림 이벤트 연동`

---

## 4. 수동 QA 체크리스트
- [ ] 프리랜서가 `/documents` 탑재 상태에서 결재자가 휴가를 반려하면, 벨 클릭 없이 3초 내 태그가 '대기'에서 '반려'로 변경되는지 확인
- [ ] `/documents` 접속 중 노티피케이션 벨에서 기존 알림 클릭 시 데이터가 재조회되는지 확인
