# "결재함" 화면 설계 문서

이 문서는 `docs/superpowers/specs/2026-08-24-freelancer-leave-management-design.md`(이하
"원 설계 문서") 7장(결재 워크플로)·9장(GNB "결재함")을 구체화한다. 원 설계 문서가 여전히 단일
진실 공급원이며, 이 문서는 그중 "결재함" 화면 범위만 상세화한 하위 문서다.

## 1. 배경

`내 문서`(`docs/superpowers/specs/2026-09-02-my-documents-design.md`) 화면 구현 이후 다음
차례로 "결재함"을 구현한다. 사이드바(`components/app-sidebar.tsx`)에는 이미 `/approvals`
링크가 자리를 잡고 있으나("아직 Task 18~22가 구현되지 않아 대상 페이지가 없다" 주석 상태),
실제 승인/반려 API·화면은 아직 전혀 구현되어 있지 않다.

최초 계획서(`docs/superpowers/plans/2026-08-24-freelancer-leave-management.md`) Task 20에
결재함의 초기 스케치가 있었지만, 그 이후 다음 변경들로 인해 그대로 쓸 수 없다:
- 역할 체계가 2종(관리자/프리랜서)에서 3종(`SUPER_ADMIN`/`APPROVER`/`FREELANCER`)으로 확장됨
  (`docs/superpowers/specs/2026-08-25-approver-role-and-freelancer-info-design.md`).
- 인증 게이트가 `requireApprovedUser()` 단일 함수에서 역할별 함수(`requireApproverOrAbove()`
  등, `lib/auth/session.ts`)로 분화됨.
- API 스타일이 리소스별 라우트(`/api/leave-requests/[id]/approve` 등)가 아니라 `action` 필드
  기반 단일 `PATCH` 라우트(`/api/documents/[id]`)로 정착됨.
- "내 문서" 화면이 목록+Dialog 상세 패턴으로 구현되어, 이 프로젝트의 문서형 화면 표준이 됨.

이 문서는 최초 스케치를 대체하고, 현재 코드베이스 상태를 기준으로 결재함을 재설계한다.

## 2. 화면 범위

- 라우트: `app/approvals/page.tsx` (신규)
- 대상: `APPROVER` + `SUPER_ADMIN` 역할만 접근 가능. `components/app-sidebar.tsx`의
  `/approvals` 링크에 `roles: ['SUPER_ADMIN', 'APPROVER']`를 추가하고, 페이지 자체에서도
  `useSession`의 role을 확인해 `FREELANCER`가 직접 URL로 접근하면 `/dashboard`로
  리다이렉트한다(`FREELANCER`는 결재자로 지정될 수 없다 — 3-역할 체계 설계).
- **이번 범위에서 제외**(각각 후속 설계/구현):
  - 대시보드(원 설계 문서 8장 "내 결재 정보" 위젯 포함) — `app/dashboard` 자체가 아직 없음.
  - 실시간 알림 UI(`NotificationBell`, Supabase Realtime 구독) — 원 설계 문서 7.1절의 인프라는
    이번 작업에서 알림 레코드 생성까지만 다루고, 화면에 표시하는 부분은 별도 작업으로 남긴다.

## 3. 화면 구성

`내 문서` 화면(`app/documents/page.tsx`)과 동일한 톤의 테이블 + 반응형 카드 레이아웃을 따른다.

### 3.1 목록

- **필터**: 상태 `Select`(대기 / 처리완료 / 전체, 기본값 **대기**) + 신청인 이름 검색
  `Input`(클라이언트 사이드 필터, 서버 쿼리 불필요 — 현재 데이터 규모 기준, 기존 컨벤션과 동일).
  - "처리완료"는 `APPROVED` / `REJECTED` / `CANCELED` 상태를 모두 포함한다(신청인이 직접
    취소한 문서도 결재자 입장에서는 "더 이상 처리할 필요 없는" 문서이므로 같은 탭에 묶는다).
- **컬럼**: 제출일 / 신청인 / 제목 / 기간·유형 / 신청일수 / 상태(`StatusBadge` 재사용).
- **정렬**: 대기 상태 문서를 항상 먼저 보여주고, 그다음 제출일 역순(대기 문서를 놓치지 않도록).
- **행 클릭**: 상세 Dialog(3.2절)를 연다.
- `leaveRequests.type = 'ADJUSTMENT'`(관리자가 수기로 입력한 연차 조정 기록, 원 설계 문서
  기준 실제 결재 대상이 아님)인 행은 목록에서 제외한다.

### 3.2 상세 Dialog — `components/approval-request-sheet.tsx` (신규)

`components/leave-request-sheet.tsx`(신청인 전용 편집 로직과 강하게 결합됨)를 확장하지 않고,
읽기 전용 필드만 있는 새 컴포넌트를 만든다.

- 표시 필드(전부 읽기 전용): 신청인, 제목, 결재자(본인), 유형, 기간, 신청일수, 사유. 상태
  배지(`StatusBadge`)를 다이얼로그 제목 옆에 표시(`LeaveRequestSheet`와 동일한 배치).
- 상태가 `REJECTED`이고 `rejectReason`이 있으면 반려 사유를 표시(`LeaveRequestSheet`의 기존
  패턴 재사용).
- **액션 (상태가 `PENDING`일 때만 노출)**:
  - "승인" 버튼 → `ConfirmDialog`(기존 컴포넌트 재사용)로 한 번 더 확인 후 처리. 승인은
    신청인의 연차를 실제로 차감시키는(잔여연차 계산에 반영되는) 되돌릴 수 없는 처리이므로,
    반려와 대칭적으로 한 단계의 확인을 거친다.
  - "반려" 버튼 → 반려 사유 입력 소형 Dialog(신규, `Textarea` 필수 입력) 오픈 → 확인 시 반려
    처리.
- 그 외 상태(`APPROVED`/`REJECTED`/`CANCELED`)는 액션 없이 정보만 표시.

## 4. API

`requireApproverOrAbove()`(기존, `lib/auth/session.ts`)로 게이트하고, "내 문서" API와 동일하게
`action` 필드 기반 스타일을 따른다.

- **`GET /api/approvals`** — 본인이 `approverId`인 문서 목록을 반환한다(신청인 이름 조인,
  `type='ADJUSTMENT'` 제외). 응답 형태는 3.1절의 컬럼 + 상세 Dialog에 필요한 필드
  (`reason`, `rejectReason` 등)를 포함한 배열.
- **`PATCH /api/approvals/[id]`** — body:
  - `{ action: 'approve' }`
  - `{ action: 'reject', rejectReason: string }` (`rejectReason`은 `min(1)` 검증)

  서버에서 대상 문서의 `approverId`가 요청자 본인과 일치하는지 재검증한다(불일치 시 404 —
  "내 문서" API의 소유권 검증과 동일한 원칙). 통과하면
  `applyTransition(status, 'APPROVE' | 'REJECT', 'APPROVER')`(기존 `lib/domain/leave-workflow.ts`)
  로 상태 전이를 검증·적용하고, `processedAt`(기존 컬럼, 지금까지 미사용)을 현재 시각으로
  기록한다. 전이 실패(`PENDING`이 아닌 문서에 승인/반려 시도 등) 시 `applyTransition`이 던지는
  Error를 잡아 400으로 응답한다(기존 라우트들과 동일한 에러 처리 패턴).

## 5. 데이터 계층 (`lib/db/leave-requests.ts`에 함수 추가)

기존 파일에 아래 함수를 추가한다(신규 파일 생성 없음 — "내 문서" 관련 함수들과 같은 파일에
이미 있는 `getMyDocumentTimeline` 등과 응집도가 맞음).

- `getApprovalQueue(approverId: number): Promise<ApprovalRow[]>` — `leaveRequests`를
  `approverId`로 필터링하고 신청인(`users`) 이름을 조인, `type != 'ADJUSTMENT'` 조건 적용.
- `getLeaveRequestForApprover(id: number, approverId: number)` — 소유권(담당 결재자인지) 확인용
  단건 조회. 없거나 담당자가 다르면 `null` 반환 → 라우트가 404 처리(기존
  `getOwnLeaveRequestById`와 동일한 형태).
- `transitionLeaveRequestAsApprover(id: number, approverId: number, action: 'APPROVE' | 'REJECT', rejectReason?: string): Promise<{ status: LeaveRequestStatus } | null>`
  — `getLeaveRequestForApprover`로 소유권 확인 후 `applyTransition` 적용,
  `status`/`processedAt`(+반려 시 `rejectReason`)을 갱신. 기존 `transitionOwnLeaveRequest`와
  동일한 구조.

## 6. 알림 연동

승인/반려 처리가 성공하면 `createNotification()`(기존, `lib/db/notifications.ts`)으로 신청인
본인에게 알림 레코드를 생성한다:
- 승인 시: `type: 'LEAVE_APPROVED'`, 메시지에 문서 제목 포함.
- 반려 시: `type: 'LEAVE_REJECTED'`, 메시지에 문서 제목 + 반려 사유 포함.

`LEAVE_ADJUSTED`(기존, `app/api/admin/users/[id]/route.ts`)와 동일한 패턴이다. 이 레코드를
화면에 실시간으로 보여주는 `NotificationBell` UI는 이번 범위에 없지만, 그 화면이 만들어지면
바로 조회 가능한 형태로 데이터를 남겨둔다.

## 7. 권한/사이드바 변경

- `components/app-sidebar.tsx`의 `COMMON_LINKS` 중 `/approvals` 항목에
  `roles: ['SUPER_ADMIN', 'APPROVER']`를 추가한다(현재는 `roles` 필드 자체가 없어 전체 역할에
  노출되고 있음 — `FREELANCER`에게는 보이지 않아야 한다).
- 주석 `// 공통 메뉴: 아직 Task 18~22가 구현되지 않아 대상 페이지가 없다...`는 결재함 페이지가
  생기면서 더 이상 사실이 아니므로 제거하거나 갱신한다.

## 8. 테스트 방향

이 저장소 컨벤션(원 설계 문서 12장, CLAUDE.md)대로 `app/`·API 라우트는 자동화 테스트 대상이
아니다. 이번 작업에서 신규 순수 함수는 생기지 않는다(상태 전이는 기존 `applyTransition` 그대로
재사용) — 전부 수동 QA로 검증한다.

**수동 QA 체크리스트**
1. 결재자 계정으로 `/approvals` 진입 시 기본 필터(대기)로 본인 담당 대기 문서만 보이는지
2. 상태 필터를 "처리완료"로 바꾸면 승인/반려/취소 문서가 모두 보이는지
3. 신청인 이름 검색이 클라이언트 필터로 정상 동작하는지
4. 목록에 `type='ADJUSTMENT'`(관리자 연차 조정 기록) 행이 노출되지 않는지
5. 타 결재자 담당 문서에 대해 `PATCH /api/approvals/[id]`를 직접 호출하면 404가 나는지
6. 승인 처리: 확인 다이얼로그 → 승인 → 신청인의 `/documents` 화면에 "승인완료" 상태로 반영되고
   잔여연차가 정상적으로 차감되는지, `LEAVE_APPROVED` 알림 레코드가 생성되는지(DB 확인)
7. 반려 처리: 사유 미입력 시 제출 차단 → 사유 입력 후 반려 → 신청인 화면에 반려 사유가
   노출되는지, `LEAVE_REJECTED` 알림 레코드가 생성되는지(DB 확인)
8. 이미 처리 완료(`APPROVED`/`REJECTED`/`CANCELED`)된 문서는 상세 Dialog에 승인/반려 버튼이
   보이지 않는지
9. `FREELANCER` 계정으로 `/approvals` 직접 접근 시 `/dashboard`로 리다이렉트되는지
10. `SUPER_ADMIN`이 본인이 기본 결재자로 지정된 문서에 대해서도 동일하게 결재함에서 처리
    가능한지(역할별 접근 차이 없음 확인)

## 9. 이번 범위에서 제외

- 대시보드 "내 결재 정보" 위젯(원 설계 문서 8장)
- 실시간 알림 UI(`NotificationBell`, Supabase Realtime 구독) — 알림 레코드 생성까지만 포함
- 다단계 결재라인, 결재 위임/대리 결재(원 설계 문서 2장 범위 외와 동일)
