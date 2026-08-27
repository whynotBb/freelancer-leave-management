# 사용자 관리 화면 통합 Design

**Goal:** "가입 승인"과 "결재담당자 관리" 두 화면을 "사용자 관리" 화면 하나로 통합하고,
"프리랜서 정보 관리"에 있던 퇴사 액션도 이 화면으로 옮긴다.

**Background:** 지금은 최고관리자가 사용자를 관리하려면 화면 3곳(가입 승인/결재담당자
관리/프리랜서 정보 관리)을 오가야 한다. 가입 승인 대기자, 활성 결재자, 프리랜서의 퇴사
처리가 각각 다른 화면에 흩어져 있어 전체 사용자 현황을 한눈에 보기 어렵다. 비밀번호
초기화 기능(별도 스펙에서 다룸)도 이 화면에 자리를 잡을 예정이라, 사용자를 다루는 관리
액션들을 한 화면으로 모은다.

## 1. 범위

**포함**
- 신규 "사용자 관리" 화면(`/admin/users-manage`), 최고관리자 전용
- 최고관리자/결재자/프리랜서를 한 테이블에서 조회 (승인대기 + 활성 상태만)
- 가입 승인/거절 기능 이관 (기존 "가입 승인" 화면 로직)
- 퇴사 액션 이관 (기존 "프리랜서 정보 관리" · "결재담당자 관리"의 퇴사 버튼)
- "가입 승인", "결재담당자 관리" 화면 삭제
- "프리랜서 정보 관리"에서 퇴사 버튼 제거
- 비밀번호 초기화 버튼 **자리만 배치**(비활성 상태) — 실제 동작은 별도 스펙

**제외**
- 승인된 사용자의 권한(역할) 변경 — 역할은 승인 시점에만 결정되고 이후 고정. 승인대기
  상태에서만 드롭다운으로 선택 가능(기존과 동일한 규칙, 화면만 이동)
- 비밀번호 초기화 실제 로직(임시 비밀번호 발급, 강제 비밀번호 변경 플로우) — 다음 스펙
- 퇴사자 관리(복구/정보 삭제) 화면 변경 — 그대로 별도 화면 유지, 이번 범위 아님
- 전체 탭에 퇴사자·거절된 신청자 표시 — 대상에서 제외(퇴사자는 퇴사자 관리 화면에서만 확인)

## 2. 데이터 모델

스키마 변경 없음. 기존 `users` 테이블의 `role`, `signupStatus`, `hireDate`, `createdAt`
컬럼을 그대로 사용한다.

**조회 대상**: `role IN ('SUPER_ADMIN','APPROVER','FREELANCER') AND signupStatus IN ('PENDING','APPROVED')`

## 3. API 설계

### 3.1 목록 조회 — `GET /api/admin/users-manage`

- 권한: `requireSuperAdmin()`
- 응답: 위 조건에 맞는 사용자 전체를 한 번에 반환 (탭 전환마다 재요청하지 않고
  클라이언트에서 필터링 — 대상 규모가 작은 관리자 화면이라 페이지네이션 불필요)
- 정렬: `signupStatus = 'PENDING'`인 행이 먼저, 그다음 `createdAt` 내림차순
- 응답 필드:

```ts
interface UserManageRow {
  id: number
  name: string
  email: string
  role: 'SUPER_ADMIN' | 'APPROVER' | 'FREELANCER'
  signupStatus: 'PENDING' | 'APPROVED'
  hireDate: string | null   // FREELANCER만 값 존재
  createdAt: string
}
```

### 3.2 승인 — `PATCH /api/admin/users-manage/[id]/approve`

기존 `app/api/admin/signups/[id]/route.ts`의 `decision: 'APPROVED'` 분기를 그대로 이관한다.

- 권한: `requireSuperAdmin()`
- 요청 바디: `{ role: 'FREELANCER' | 'APPROVER', hireDate?: string }`
- 검증(기존과 동일):
  - `role` 필수
  - `role === 'FREELANCER'`이면 `hireDate` 필수 — 없으면 400 `"프리랜서 승인 시 입사일은 필수입니다."`
- 처리: `signupStatus='APPROVED'`, `role`, `hireDate`(FREELANCER 아니면 `null`) 갱신.
  기본 결재자는 이 API에서 다루지 않는다 — 승인 후 프리랜서 정보 관리의 결재자 변경
  기능으로 별도 지정한다.

### 3.3 거절 — `PATCH /api/admin/users-manage/[id]/reject`

기존 `decision: 'REJECTED'` 분기를 그대로 이관한다.

- 권한: `requireSuperAdmin()`
- 처리: `signupStatus='REJECTED'`로만 갱신 (행 삭제 안 함 — 기존과 동일)
- 거절된 사용자는 곧바로 목록(전체/승인대기 모두)에서 사라진다 — `signupStatus`가
  `PENDING`/`APPROVED`가 아니게 되어 3.1의 조회 조건에서 자동 제외

### 3.4 퇴사 — 기존 API 재사용

`POST /api/admin/users/[id]/resign` (변경 없음). `ResignDialog` 컴포넌트를 이 화면에서도
그대로 사용한다.

### 3.5 기존 API 정리

| 경로 | 처리 |
|---|---|
| `app/api/admin/signups/route.ts`, `app/api/admin/signups/[id]/route.ts` | **삭제** — 3.1~3.3으로 대체 |
| `app/api/admin/approvers/route.ts` | **유지** — `app/admin/users/page.tsx`(프리랜서 정보 관리)의 기본 결재자 변경 콤보박스가 여전히 이 API로 결재자 목록을 조회한다. 화면(`app/admin/approvers/page.tsx`)만 삭제하고 API는 남긴다 |
| `app/api/admin/users/[id]/resign/route.ts` | 유지, 변경 없음 |

## 4. 화면 설계

### 4.1 라우팅 & 사이드바

- 신규 라우트: `/admin/users-manage`, 페이지 타이틀 "사용자 관리"
- `components/app-sidebar.tsx`의 `ADMIN_LINKS` 변경:
  - 제거: `{ href: '/admin/signups', label: '가입 승인', ... }`,
    `{ href: '/admin/approvers', label: '결재담당자 관리', ... }`
  - 추가: `{ href: '/admin/users-manage', label: '사용자 관리', icon: UsersIcon, roles: ['SUPER_ADMIN'] }`
  - 유지: 프리랜서 정보 관리(`roles: ['SUPER_ADMIN','APPROVER']`), 퇴사자 관리
- 삭제 파일: `app/admin/signups/page.tsx`, `app/admin/approvers/page.tsx`, 그리고 각 폴더의
  `layout.tsx`(페이지 타이틀용으로 존재한다면 함께 삭제)

### 4.2 탭

- **전체**: `signupStatus`가 `PENDING`인 행을 먼저, `APPROVED`인 행을 그다음에 표시
- **승인대기**: `signupStatus === 'PENDING'`인 행만

### 4.3 테이블 컬럼

| 컬럼 | PENDING 행 | APPROVED 행 |
|---|---|---|
| 이름 / 이메일 | 텍스트 | 텍스트 |
| 권한 | 드롭다운(프리랜서/결재자, 필수) — 기존 가입 승인 화면의 `Select` 그대로 이관 | 배지(고정) — 기존 결재담당자 관리 화면의 `ROLE_BADGE_CLASS`(SUPER_ADMIN=indigo, APPROVER=sky)에 FREELANCER=emerald를 추가해 재사용 |
| 입사일 | 권한=프리랜서 선택 시에만 `DatePicker` 노출·필수 | 프리랜서면 날짜 표시(읽기전용), 아니면 "-" |
| 가입일 | `createdAt` 표시 | `createdAt` 표시 |
| 상태 | "승인대기" 배지 | "활성" 배지 |
| 비밀번호 초기화 | 미노출 | 버튼 배치, `disabled` (다음 스펙에서 활성화) |
| 승인 / 거절 | 버튼 2개 (기존 가입 승인 화면과 동일 동작) | 미노출 |
| 퇴사 | 미노출 | 버튼 → `ResignDialog` 오픈 (기존과 동일하게 성공 시 `/admin/departures`로 이동). **단, `role='SUPER_ADMIN'`인 행에는 퇴사 버튼을 표시하지 않는다** — 기존 결재담당자 관리 화면의 `role === 'APPROVER'` 조건을 그대로 계승한 안전장치로, 최고관리자 계정이 퇴사 처리되어 로그인이 막히면 퇴사자 관리 화면(최고관리자 전용)에서도 복구할 관리자가 없어지는 자기잠금을 방지한다. `resignUser`(`lib/db/departures.ts`)에도 동일한 검증을 서버 측에 추가한다(`SUPER_ADMIN_PROTECTED` 에러) |

- 데스크톱 테이블 + 모바일 카드형 레이아웃. 기존 "가입 승인"/"결재담당자 관리" 화면의
  두 레이아웃 패턴을 그대로 재사용한다.
- 로딩 스피너: `LoadingSpinner` 컴포넌트 사용(기존 규칙)
- 목록 조회 실패 시 에러 텍스트 표시(기존 "결재담당자 관리" 화면 패턴과 동일)

### 4.4 프리랜서 정보 관리 변경

- 퇴사 버튼 및 `ResignDialog` 호출부(`app/admin/users/page.tsx`)를 제거한다.
- 그 외 필드(연차 이력, 만근예외, 기본 결재자 변경, 엑셀 다운로드)는 변경 없음.

## 5. 권한

모든 신규 라우트/API는 `requireSuperAdmin()`으로 통일한다(기존 가입 승인·퇴사·결재담당자
관리의 액션 권한과 동일 수준 — 결재담당자 관리 화면 자체도 사이드바에서 이미
`SUPER_ADMIN` 전용이었다).

## 6. 테스트 방침

이 프로젝트 관례상 `app/`·API 라우트는 자동화 테스트 대신 수동/curl 검증을 한다(비즈니스
로직이 있는 `lib/domain/**`만 Vitest 대상). 검증 항목:

- 승인대기 사용자 승인(프리랜서/결재자 각각) → 목록에서 사라지고 프리랜서 정보 관리·
  결재자 콤보박스에 정상 반영되는지
- 프리랜서 승인 시 입사일 누락 → 400 에러 문구 확인
- 거절 → 목록에서 즉시 사라지는지, DB에는 `REJECTED`로 남아있는지
- 퇴사 버튼 → 기존 퇴사자 관리 플로우와 동일하게 동작하는지(대기 결재 위임 모달 포함)
- 사이드바에서 "가입 승인"/"결재담당자 관리" 링크가 사라지고 "사용자 관리"만 보이는지
- APPROVER 권한 계정으로 `/admin/users-manage` 직접 접근 시 차단되는지
