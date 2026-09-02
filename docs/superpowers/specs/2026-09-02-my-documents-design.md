# "내 문서" 화면 설계 문서 (연차 신청 + 내 휴가정보 통합)

이 문서는 `docs/superpowers/specs/2026-08-24-freelancer-leave-management-design.md`(이하
"원 설계 문서") 6장(휴가계 작성 & 제출)·9장(GNB)을 구체화하고 일부 내용을 갱신한다. 원 설계
문서가 여전히 단일 진실 공급원이며, 이 문서는 그 중 "내 문서" 화면 범위만 상세화한 하위 문서다.

## 1. 배경

남은 화면(대시보드, 내 문서, 결재함, 실시간 알림) 중 "내 문서"를 먼저 구현하기로 했다 — 연차
신청/결재/대시보드 전체 워크플로의 데이터 출발점이기 때문이다. 원 설계 문서 9장은 "내
휴가정보"(연차 발생/사용 내역, 원장 상세 조회)와 "내 문서"(신청 목록/작성)를 별도 GNB 메뉴로
나눠뒀지만, 실제 구현 단계에서 두 화면을 하나로 합치기로 했다(2절 참고). 사이드바(`components/app-sidebar.tsx`)에는 이미 `/documents` 링크가 자리를 잡고 있다.

## 2. 원 설계 문서 대비 변경 사항

- **6장 "직급/부서" 항목 제거**: 원 설계 문서 6장은 신청서에 "신청인 / 직급 / 부서(자동 표시,
  읽기 전용)"를 표시하도록 했다. 그러나 `users` 테이블에는 직급/부서 컬럼이 없다 —
  2026-08-25 프리랜서 정보 관리 화면 개편(커밋 `d12f54a`)에서 이 개념 자체가 빠졌고, 이후
  3-역할 체계 설계(`docs/superpowers/specs/2026-08-25-approver-role-and-freelancer-info-design.md`)에도
  등장하지 않는다. 새 컬럼을 추가하는 대신 신청서에는 신청인 이름만 표시한다.
- **9장 GNB 통합**: "내 휴가정보"를 별도 메뉴로 만들지 않고 "내 문서" 화면 하나에 통합한다
  (4절 참고). 원 설계 문서 9장도 이에 맞춰 갱신한다.
- 그 외 6·7장의 입력 항목, 신청일수 계산 규칙, 상태 전이, 유효성 검증 규칙은 원 설계 문서를
  그대로 따른다(변경 없음).

## 3. 화면 범위

- 라우트: `app/documents/page.tsx` (신규)
- 대상: **FREELANCER 역할만** 접근 가능. `components/app-sidebar.tsx`의 `/documents` 링크에
  `roles: ['FREELANCER']`를 추가하고, 페이지 자체에서도 `useSession`의 role을 확인해 다른
  역할이 직접 URL로 접근하면 대시보드로 리다이렉트한다(APPROVER/SUPER_ADMIN은 본인 휴가계·
  연차 잔액이 없다 — CLAUDE.md 핵심 비즈니스 규칙).
- 결재함/대시보드/실시간 알림은 이번 범위에서 제외(각각 후속 작업).

## 4. 화면 구성

한 화면에 위에서 아래로:

1. **휴가현황 요약**: 입사일, 근속 연차(예: "9년차" 뱃지), 연차휴가 총 발생/사용/잔여
   (`getLeaveBalance` 재사용).
2. **"+ 연차 신청" 버튼**: 클릭 시 작성 모드로 `LeaveRequestSheet` 오픈.
3. **통합 타임라인 리스트**: 본인의 연차 신청 문서(전체 상태) + 연차 발생/조정 내역을 날짜
   내림차순으로 병합해 하나의 표로 보여준다. 참고 이미지(그룹웨어 "내 휴가 기록" 화면)의
   "휴가사용일수"(휴가 유형별 세부 집계 테이블)는 포함하지 않는다 — 이 프로젝트는 연차 유형이
   하나(연차/반차)뿐이라 요약 블록의 발생/사용/잔여 표시만으로 충분하고, 참고 이미지의 세부
   집계는 병가·출산휴가 등 이 프로젝트 범위에 없는 휴가 유형 기준이라 불필요하다.
   - 신청 문서 행: 제목, 기간, 유형, 신청일수, 상태 배지(대기/승인완료/반려/취소). 클릭 시
     `LeaveRequestSheet`를 상세 모드로 열어 결재자/반려 사유 등을 확인.
   - 발생/조정 내역 행: 기존 관리자용 `UserHistoryPanel`과 동일한 형태(날짜, 구분, 금액,
     사유, 처리자) — 클릭 동작 없음(정보성).
   - 필터: 연도 + 제목 검색(참고 이미지와 동일한 수준). 문서유형 필터는 유형이 3가지뿐이라
     불필요.
4. **`LeaveRequestSheet`** (작성/수정/상세 겸용, `components/leave-request-sheet.tsx` 신규):
   - 필드: 결재자(기본값 본인의 `defaultApproverId`, `ApproverCombobox`로 변경 가능), 제목,
     기간(연차는 시작~종료일 range, 반차 선택 시 단일 날짜 필드로 전환), 유형(연차/오전반차/
     오후반차), 신청일수(자동 계산·읽기전용), 잔여연차(자동 표시·읽기전용), 사유.
   - 액션: 임시저장, 제출. DRAFT 상태 문서는 다시 열어 수정 후 재저장하거나 삭제할 수 있다.
   - PENDING 상태 문서는 상세 모드에서 "취소" 버튼 제공(사유 입력 없이 확인 다이얼로그만).
   - 기간이 본인의 기존 대기/승인 문서와 겹치면 제출을 막지 않고 Sheet 내 인라인 경고 배너로
     표시(원 설계 문서 6장 유효성 검증 규칙).

## 5. API

모두 `app/api/documents/` 아래 신규 라우트. 인증은 `requireApprovedUser()`(기존)로 확인하고
FREELANCER 역할만 허용.

- `GET /api/documents` — 본인의 통합 타임라인(4절의 신청 문서 + 발생/조정 내역, 서버에서 병합
  완료된 배열)과 요약 정보(입사일, 발생/사용/잔여)를 함께 반환.
- `POST /api/documents` — 신규 작성. body: `{ action: 'save' | 'submit', title, approverId,
  startDate, endDate, type, reason }`. `save`는 DRAFT로 저장, `submit`은 저장 후 즉시
  `applyTransition('DRAFT', 'SUBMIT', 'REQUESTER')`로 PENDING 전환(잔여연차 초과/결재자 미지정
  검증 포함).
- `PATCH /api/documents/[id]` — 두 가지 동작을 `action` 필드로 구분:
  - DRAFT 수정: 본인 소유 + 상태가 DRAFT일 때만 필드 재저장.
  - 상태 전이: `action: 'submit' | 'cancel'` → `applyTransition`(기존 로직) 재사용.
- `DELETE /api/documents/[id]` — 본인 소유 + DRAFT 상태일 때만 삭제 허용.

## 6. 데이터 계층

- **통합 타임라인**: 새 함수 `getMyDocumentTimeline(userId)` (`lib/db/leave-requests.ts` 신설)를
  추가한다. 기존 `lib/db/user-history.ts`의 `getUserHistory`는 관리자용으로
  `status='APPROVED'`인 사용 내역만 포함하도록 만들어져 있어(대기/반려 문서를 보여줄 목적이
  아님) 그대로 재사용하면 대기·반려 문서가 빠진다. 이 함수는 손대지 않고, 자기서비스용 함수를
  새로 만든다:
  - 본인 `leaveGrants` 전체 조회(발생/조정 — 기존 `getUserHistory`의 grant 조회 쿼리와 동일한
    모양) → "연차 자동 발생"/"연차 조정" 항목으로 매핑.
  - 본인 `leaveRequests` **전체 상태** 조회(`type != 'ADJUSTMENT'`인 것만 — ADJUSTMENT는 관리자
    조정으로 leaveGrants 쪽에 이미 기록됨) → 상태 배지 포함한 "신청 문서" 항목으로 매핑.
  - 두 목록을 날짜 내림차순으로 병합해 반환. 기존 `HistoryEntry`/`buildHistoryTimeline`(관리자
    전용)은 변경하지 않는다 — 요구사항이 달라(상태 배지 필요) 별도 타입으로 둔다.
- 신청일수 계산: `lib/domain/leave-day-count.ts` 재사용.
- 잔여연차 초과/결재자 미지정 검증: `lib/domain/leave-validation.ts`, `getLeaveBalance` 재사용.
- 기간 중복 검사: `lib/domain/leave-validation.ts`의 `hasOverlappingActiveRequest` 재사용.
- 상태 전이: `lib/domain/leave-workflow.ts`의 `applyTransition` 재사용(신규 도메인 로직 없음).

## 7. 테스트 방향

이 저장소 컨벤션(원 설계 문서 12장, CLAUDE.md)대로 `app/`·API 라우트는 자동화 테스트 대상이
아니다. 이번 작업에서 신규 순수 함수가 생기면(예: 타임라인 병합/정렬을 순수 함수로 뽑을 경우)
그 부분만 Vitest 대상으로 추가하고, 나머지는 수동 QA로 검증한다.

**수동 QA 체크리스트(초안, 구현 계획 단계에서 구체화)**
1. 임시저장 → 다시 열어 수정 → 제출 흐름
2. 제출 → 잔여연차 초과 시 차단 확인
3. 제출 → 결재자 미지정 시 차단 확인
4. 기간 중복 시 경고 배너(비차단) 확인
5. 대기 상태 문서 취소
6. DRAFT 문서 삭제
7. 통합 타임라인에 신청 문서(전체 상태) + 발생/조정 내역이 날짜순으로 올바르게 섞이는지
8. 반차 선택 시 단일 날짜 필드 전환 확인
9. FREELANCER 외 역할이 `/documents` 직접 접근 시 리다이렉트 확인

## 8. 이번 범위에서 제외

- 결재함, 대시보드, 실시간 알림(각각 후속 설계/구현)
- 참고 이미지의 다중 휴가유형 세부 집계("휴가사용일수" 섹션)
