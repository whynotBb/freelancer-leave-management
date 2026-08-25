# 프리랜서 상세 패널 및 결재자 변경 이력 설계 문서

- 작성일: 2026-08-26
- 상태: 승인 대기 (사용자 리뷰 전)
- 기준 문서:
  - `docs/superpowers/specs/2026-08-24-freelancer-leave-management-design.md` (이하 "원 설계 문서")
  - `docs/superpowers/specs/2026-08-25-approver-role-and-freelancer-info-design.md` (이하 "결재자
    역할 설계 문서")

## 1. 배경 및 목적

"프리랜서 정보 관리" 화면에서 이름을 클릭하면 우측에서 슬라이드되는 상세 패널을 열어, 해당
프리랜서의 연차 발생·사용·조정 이력과 기본 결재자 변경 이력을 한 곳에서 조회할 수 있게 한다.

이 과정에서 기본 결재자 재배정 방식도 함께 바뀐다. 지금은 콤보박스에서 선택하는 즉시 반영되고
아무 기록도 남지 않는데, 이번 문서에서는 연차 조정과 동일하게 **사유 입력 모달을 거치고, 변경
이력을 남기고, 알림을 보내는** 방식으로 바꾼다. 이는 결재자 역할 설계 문서 4.1절("선택 즉시
반영, 사유 모달 없음")을 대체한다.

## 2. 범위

**포함**
- 프리랜서 정보 관리 테이블의 이름에 호버 시 밑줄+포인터, 클릭 시 우측 슬라이드 패널
- 패널: 프리랜서 요약 정보(읽기 전용) + 연차 발생/사용/조정 + 결재자 변경을 합친 통합 이력 테이블
- 기본 결재자 재배정을 사유 필수 모달 방식으로 변경, 변경 이력 저장, 알림 발송
- 결재자 변경 이력 저장용 신규 테이블

**제외 (추후 별도 작업)**
- 이력 페이지네이션 — 현재 데이터 규모에서는 불필요. 나중에 필요해지면 별도 작업.
- 실제 휴가 신청/승인 워크플로(결재함) — 아직 이 저장소에 구현되어 있지 않다. 이 문서의 이력
  조회는 그 워크플로가 나중에 붙어도 코드 변경 없이 자연스럽게 함께 보이도록 설계하지만, 워크플로
  자체를 만들지는 않는다.
- 패널 안에서의 수정 기능 — 패널은 조회 전용이다. 입사일/사용가능·사용 연차 수정은 계속 기존
  테이블 인라인 UI에서 한다(결재자 재배정만 예외적으로 모달을 거치되, 트리거는 여전히 테이블의
  콤보박스다).

## 3. 프리랜서 상세 패널 UI

### 3.1 트리거

테이블(데스크톱)과 카드(모바일) 양쪽에서 이름 텍스트에:
- 마우스 호버 시 밑줄 + `cursor-pointer`
- 클릭 시 패널 오픈(SUPER_ADMIN, APPROVER 모두 — 현재 테이블도 두 역할 모두에게 전체 프리랜서
  목록을 보여주므로, 조회 전용인 패널도 동일하게 두 역할 모두에게 연다)

### 3.2 레이아웃

기존 `components/ui/sheet.tsx`(이미 설치되어 있으나 이 저장소에서 아직 쓰인 적 없음)를 사용한다.
기본값은 우측 기준 `w-3/4`인데, 요구사항에 맞게 커스텀 너비를 지정한다:
- `lg:`(1024px) 이상: 가로 전체의 25%
- `lg:` 미만: 가로 전체의 95%

이 분기점은 프리랜서 정보 관리 화면이 이미 데스크톱 테이블 ↔ 모바일 카드 전환에 쓰고 있는
`lg:` 분기점과 통일한다. 배경 딤/블러는 `Sheet`에 이미 내장된 오버레이(`bg-black/10` +
`backdrop-blur-xs`)를 그대로 쓴다.

### 3.3 패널 내용

**상단 요약(읽기 전용)**: 이름, 이메일, 입사일, 기본 결재자, 사용가능·사용·미사용 연차. 패널을
열 때 별도 API를 호출하지 않고, 메인 테이블이 이미 불러온 `users` 상태에서 해당 행 데이터를
그대로 재사용한다.

**이력 테이블**: 아래 세 출처를 합쳐 날짜 역순으로 정렬해 하나의 테이블로 보여준다. 유형 판별
기준은 모호함이 없도록 컬럼값으로 정확히 나눈다:
- `leaveGrants` — `created_by IS NULL`이면 "발생"(자동, 아직 이 저장소엔 구현되어 있지 않아
  현재는 나타나지 않음), `created_by IS NOT NULL`이면 "조정"(수동 — 현재 유일한 경로)
- `leaveRequests`(`status='APPROVED'`만) — `type='ADJUSTMENT'`이면 "조정"(수동), 그 외
  (`FULL`/`AM_HALF`/`PM_HALF`, 아직 미구현이라 현재는 나타나지 않음)이면 "사용"
- `approver_changes`(6장 참고) — "결재자 변경"

각 행에는 유형 배지, 날짜, 내용(일수 증감 또는 이전→이후 값), 사유, 처리자를 표시한다. 현재
사이클로 필터링하지 않고 전체 기간을 보여준다 — "이력"의 목적은 과거 기록 추적이라, 사이클
경계로 자르면 오히려 불편하다. 상단 요약의 "미사용 연차"만 기존과 동일하게 현재 사이클 기준
계산을 유지한다.

## 4. 기본 결재자 재배정 플로우 변경

기존 `changeApprover`(콤보박스에서 선택 즉시 PATCH, 사유 없음)를 다음으로 대체한다:

1. 콤보박스에서 새 결재자 선택
2. 이미 구현된 `LeaveAdjustmentDialog`를 재사용해 "기본 결재자: (이전 이름 또는 '미지정') →
   (새 이름)" 변경 요약을 보여주고 사유 입력을 요구
3. 확인 시 `PATCH /api/admin/users/[id]`를 `{defaultApproverId, reason}`으로 호출
4. 서버는 `defaultApproverId`가 있으면 `reason`을 필수로 검증(기존 `needsReason` 조건에
   `defaultApproverId !== undefined`도 추가), `approver_changes`에 이력을 남기고, 알림을
   발송한다

취소 시 콤보박스 선택은 반영되지 않는다(모달의 기존 취소 동작과 동일).

## 5. 알림

결재자가 바뀌면 `notifications.type = 'APPROVER_CHANGED'`(신규 값, 컬럼은 varchar라 스키마
변경 불필요)로 다음에게 알린다:
- 프리랜서 본인 — "담당 결재자가 (새 이름)(으)로 변경되었습니다."
- 새로 지정된 결재자 — "(프리랜서 이름)의 담당 결재자로 지정되었습니다."

기존 결재자에게는 보내지 않는다(더 이상 담당이 아니므로).

## 6. 데이터 모델

`lib/db/schema.ts`에 신규 테이블 추가:

```ts
export const approverChanges = pgTable('approver_changes', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  beforeApproverId: integer('before_approver_id').references(() => users.id),
  afterApproverId: integer('after_approver_id').notNull().references(() => users.id),
  reason: text('reason').notNull(),
  changedBy: integer('changed_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
```

`beforeApproverId`는 nullable — 지금까지 결재자가 지정된 적 없는 프리랜서가 처음 배정되는
경우를 대비한다.

## 7. API 변경

**신규: `GET /api/admin/users/[id]/history`**
- 게이트: `requireApproverOrAbove()` — 메인 목록 API(`GET /api/admin/users`)와 동일하게, 역할별
  행 단위 제한 없이 전체 열람 가능(패널은 조회 전용이라 편집 권한과 분리해서 생각한다)
- 응답: `leaveGrants` + `leaveRequests`(APPROVED) + `approver_changes`를 합쳐 통합 정렬한 배열.
  각 항목은 유형, 날짜, 내용, 사유, 처리자 이름을 포함한다.

**변경: `PATCH /api/admin/users/[id]`**
- `body.defaultApproverId !== undefined`일 때도 `reason` 필수(기존 `needsReason` 조건 확장)
- `defaultApproverId` 변경이 실제로 반영되면(값이 실제로 달라지는 경우) `approver_changes`에
  행 삽입 + 5장의 알림 발송
- 값이 이전과 동일하면(같은 결재자 재선택) 이력/알림 없이 무시 — 기존 연차 조정 델타 0일 때
  null을 반환하는 것과 같은 패턴

## 8. 테스트 방향

- `approver_changes` 스키마 추가 + drizzle 마이그레이션
- 이력 병합 로직(세 출처를 하나의 유형으로 매핑하고 날짜 역순 정렬)은 순수 함수로 분리해
  `lib/domain/**`에 유닛테스트 작성
- 결재자 변경 시 `defaultApproverId`가 이전과 동일하면 이력/알림이 발생하지 않는지 테스트
- 실제 브라우저로 검증: 패널 오픈/닫힘, 데스크톱(25%)·모바일(95%) 너비 전환, 이력 테이블 표출,
  결재자 변경 시 모달→사유 필수→이력 기록→알림 발송 전 과정

## 9. 관련 문서 갱신

결재자 역할 설계 문서 4.1절("기본 결재자... 선택 즉시 반영, 사유 모달 없음")에 이 문서로
대체되었다는 갱신 안내를 추가한다(구현 계획의 마지막 작업 항목으로 포함).
