# "대시보드" 화면 설계 문서

이 문서는 `docs/superpowers/specs/2026-08-24-freelancer-leave-management-design.md`(이하
"원 설계 문서") 8장(대시보드)·9장(GNB "대시보드")을 3-역할 체계(`SUPER_ADMIN`/`APPROVER`/
`FREELANCER`)에 맞춰 구체화한다. 원 설계 문서가 여전히 단일 진실 공급원이며, 이 문서는 그중
"대시보드" 화면 범위만 상세화한 하위 문서다.

## 1. 배경

원 설계 문서 8장은 대시보드를 2-역할 체계(관리자/프리랜서) 기준으로 "내 휴가 정보"(프리랜서)와
"내 결재 정보"(결재자로 지정된 사람)로만 정의했다. 이후 3-역할 체계 도입
(`docs/superpowers/specs/2026-08-25-approver-role-and-freelancer-info-design.md`)으로
`APPROVER`가 순수 관리 역할(본인 휴가계 없음)로 분리되고 `SUPER_ADMIN`이 별도 역할이 되면서,
세 역할이 대시보드에서 봐야 할 정보가 서로 달라졌다. 이 문서는 그 세 역할별 화면을 정의한다.

사이드바(`components/app-sidebar.tsx`)에는 이미 `/dashboard` 링크가 `COMMON_LINKS`(역할 제한
없음)에 있으나 페이지 자체가 아직 없다. `/documents`, `/approvals`의 리다이렉트 대상으로도 이미
`/dashboard`가 쓰이고 있다.

## 2. 화면 범위

- 라우트: `app/dashboard/page.tsx` (신규). 역할 제한 없이 로그인한 모든 사용자가 접근하며,
  세션의 role에 따라 다른 내용을 렌더링한다(리다이렉트 없음 — `/documents`/`/approvals`와 달리
  이 화면은 모든 역할의 홈이다).
- 차트/그래프 없음 — 이 저장소의 기존 화면(내 문서, 프리랜서 정보 관리 등)과 동일하게 숫자·배지
  위주의 테두리 박스로만 구성한다.
- **이번 범위에서 제외**: 원 설계 문서 7.1절의 실시간 알림 UI(`NotificationBell`)는 여전히 별도
  후속 작업이다. 이 화면의 숫자들은 페이지 진입 시 서버 쿼리로 한 번 계산되는 정적 요약이며,
  실시간 구독이 아니다(원 설계 문서 7장 "대시보드 진입 시 쿼리 기반으로... 표시" 문구와 동일한
  방식).

## 3. 화면 구성

세 역할 모두 기존 화면들의 테두리 박스 컨벤션(`rounded-lg border p-4` + `grid` +
`text-xs text-muted-foreground` 라벨/값, `/documents` 페이지의 "휴가현황" 박스와 동일한 톤)을
그대로 따른다.

### 3.1 프리랜서(FREELANCER)

- **"내 휴가 정보" 박스**: 발생 / 사용 / 잔여 / 결재대기 4칸. "결재대기"는 본인이 신청한 문서
  중 `PENDING` 상태 건수(원 설계 문서 8장에 명시된 항목). 박스 우측 상단에 "내 문서로" 버튼
  (`/documents`로 이동).
- `/documents` 화면의 "휴가현황" 요약(입사일·근속연차 포함, 더 상세함)과 데이터가 겹치지만,
  대시보드는 그 축약형이다 — 입사일/근속연차는 대시보드에서 생략하고 클릭 한 번으로 상세 화면
  으로 넘어가게 한다.

### 3.2 결재자(APPROVER)

- **"내 결재 정보" 박스**: 결재대기 / 처리완료 / 담당 프리랜서 3칸.
  - 결재대기: 본인이 결재자로 지정된 문서 중 `PENDING` 건수.
  - 처리완료: 본인이 승인 또는 반려 처리한 문서 건수(`APPROVED` + `REJECTED`, 신청인이 직접
    취소한 `CANCELED`는 제외 — 본인이 처리한 게 아니므로).
  - 담당 프리랜서: 본인이 기본 결재자로 지정된 재직(`APPROVED`) 프리랜서 수.
  - 박스 우측 상단에 "결재함으로" 버튼(`/approvals`로 이동).

### 3.3 최고관리자(SUPER_ADMIN)

- **"전체 현황" 박스**: 재직 프리랜서 수 / 결재자 수(`APPROVER`+`SUPER_ADMIN`, 재직 상태) 2칸.
- **가입 승인 대기 카드**: 대기 중인 가입 신청이 1건 이상일 때만 별도로 강조 표시되는 클릭
  가능한 카드("가입 승인 대기 N건 →"). 클릭 시 `/admin/users-manage`로 이동. 0건이면 이 카드
  자체를 렌더링하지 않는다(건수가 있는 액션만 카드로 노출하기로 결정 — 나머지 관리 메뉴는
  사이드바로 충분).
- **결재 정보**: 본인이 1명 이상의 프리랜서에게 기본 결재자로 지정되어 있으면(담당 프리랜서
  수 > 0), 3.2절과 동일한 "내 결재 정보" 박스를 추가로 표시한다. 담당 프리랜서 수가 0이어도
  본인의 결재대기 건수가 1건 이상이면 마찬가지로 이 박스를 표시한다 — 결재자 재지정
  (`app/api/admin/users/[id]/route.ts`)은 이미 제출된 문서의 `leaveRequests.approverId`를
  소급 변경하지 않고, 퇴사 처리(`lib/db/departures.ts`)도 결재자 본인이 퇴사하는 경우에만
  결재대기 건을 재배정하므로, 담당 프리랜서 수와 실제 결재대기 보유 여부가 항상 일치하지는
  않기 때문이다(예: 재지정으로 담당에서 빠졌지만 과거 제출 건이 남아 있는 경우, 담당
  프리랜서가 퇴사해 집계에서 빠졌지만 그가 낸 문서가 아직 대기 중인 경우). 담당 프리랜서
  수와 결재대기 건수가 모두 0일 때만 이 섹션 자체를 렌더링하지 않는다.

## 4. API

- **`GET /api/dashboard`** — `requireApprovedUser()`(기존, 전 역할 통과)로 게이트. 호출자의
  role에 따라 다른 형태의 payload를 반환한다:
  - `FREELANCER`: `{ role: 'FREELANCER', freelancer: { granted, used, remaining, pendingCount } }`
  - `APPROVER`: `{ role: 'APPROVER', approver: { pendingCount, processedCount, assignedFreelancerCount } }`
  - `SUPER_ADMIN`: `{ role: 'SUPER_ADMIN', admin: { activeFreelancerCount, approverCount, pendingSignupCount }, approver: { pendingCount, processedCount, assignedFreelancerCount } | null }`
    (`approver`는 `assignedFreelancerCount > 0`일 때만 값을 채우고, 아니면 `null`.)

## 5. 데이터 계층

새 비즈니스 로직 없이 전부 단순 COUNT/집계 쿼리다.

- `lib/db/leave-requests.ts`에 추가:
  - `getPendingRequestCountForRequester(userId): Promise<number>` — 본인 문서 중
    `status='PENDING'`(`type != 'ADJUSTMENT'`) 건수.
  - `getApprovalCounts(approverId): Promise<{ pending: number; processed: number }>` —
    `getApprovalQueue`처럼 전체 행을 가져오지 않고 COUNT만 계산(대시보드 카드는 제목/사유 등
    상세 필드가 필요 없어 더 가볍게).
- `lib/db/freelancers.ts`(또는 대시보드 전용 신규 파일)에 추가:
  - `getAssignedFreelancerCount(approverId): Promise<number>` — `defaultApproverId=approverId`
    이면서 재직 중인 프리랜서 수.
  - `getActiveFreelancerCount(): Promise<number>`, `getApproverCount(): Promise<number>`,
    `getPendingSignupCount(): Promise<number>` — SUPER_ADMIN 전체 현황용.
- `getMyDocumentSummary(userId)`(기존)를 그대로 재사용해 발생/사용/잔여를 얻는다.

## 6. 화면 구조 (컴포넌트)

- `app/dashboard/page.tsx`: 데이터 로드(`GET /api/dashboard`) + role에 따라 아래 세 컴포넌트 중
  하나(또는 SUPER_ADMIN의 경우 AdminDashboard + 조건부 결재 정보 박스)를 렌더링.
- `components/dashboard/freelancer-dashboard.tsx`, `approver-dashboard.tsx`,
  `admin-dashboard.tsx` — 역할별 화면을 각각 독립된 파일로 분리한다(한 파일에 3역할 분기를 몰아
  넣지 않음 — 파일마다 책임을 하나로 유지).
- "내 결재 정보" 박스는 APPROVER와 SUPER_ADMIN 양쪽에서 동일하게 쓰이므로, 별도의 작은
  프레젠테이션 컴포넌트(예: `components/dashboard/approver-summary-box.tsx`)로 뽑아 두 곳에서
  재사용한다(중복 방지).

## 7. 테스트 방향

이 저장소 컨벤션대로 `app/`·API 라우트·`lib/db/*`는 자동화 테스트 대상이 아니다. 전부 단순
COUNT 쿼리라 새 순수 함수도 생기지 않는다 — 수동 QA로 검증한다.

**수동 QA 체크리스트(초안)**
1. FREELANCER로 로그인 시 발생/사용/잔여/결재대기 숫자가 `/documents` 화면과 일치하는지, "내
   문서로" 버튼이 `/documents`로 이동하는지
2. APPROVER로 로그인 시 결재대기/처리완료/담당 프리랜서 숫자가 `/admin/users`(프리랜서 정보
   관리, "담당 프리랜서만 보기" 토글)·`/approvals`와 일치하는지
3. SUPER_ADMIN으로 로그인 시 재직 프리랜서 수/결재자 수가 실제 목록과 일치하는지
4. 가입 승인 대기가 0건일 때 카드가 안 보이고, 1건 이상이면 보이며 클릭 시
   `/admin/users-manage`로 이동하는지
5. SUPER_ADMIN이 아무에게도 기본 결재자로 지정되지 않았을 때 결재 정보 박스가 안 보이는지,
   1명 이상 지정되면 보이는지
6. 세 역할 모두 `/dashboard` 직접 접근 시 리다이렉트 없이 정상 진입하는지

## 8. 이번 범위에서 제외

- 실시간 알림 UI(`NotificationBell`, Supabase Realtime 구독)
- 차트/그래프, 기간별 추이 등 시각화
- 관리 메뉴 전체를 바로가기 카드로 나열(사이드바로 충분하다고 판단 — 건수가 있는 액션 카드만
  노출)
