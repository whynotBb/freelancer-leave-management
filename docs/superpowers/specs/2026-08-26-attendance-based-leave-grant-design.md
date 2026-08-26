# 만근 판정 정정 및 월별 자동 연차 발생 설계 문서

- 작성일: 2026-08-26
- 상태: 승인 대기 (사용자 리뷰 전)
- 기준 문서:
  - `docs/superpowers/specs/2026-08-24-freelancer-leave-management-design.md` (이하 "원 설계 문서")
  - `docs/superpowers/specs/2026-08-25-approver-role-and-freelancer-info-design.md`

## 1. 배경 및 목적

프리랜서 정보 관리 화면에 "이용 안내" 패널을 추가하던 중, 원 설계 문서 5.2절의 만근 판정 규칙이
실제 정책과 다르다는 것이 확인되었다.

- **원 설계 문서 5.2절(잘못된 규칙)**: 평가월에 승인된 연차(전일) 사용이 있으면 그 달은 만근이
  아니다.
- **실제 정책**: 이미 정식으로 쌓인 연차를 사용하는 것은 만근 여부에 영향을 주지 않는다. 만근을
  깨는 것은 오직 결근(무단 결석)뿐이다.
  - 예: 2026년 8월 입사 + 8월 만근 → 연차 1개 발생. 9월에 그 연차 1개를 정식 사용하고 그 외
    결근이 없다면, 9월도 만근으로 인정되어 연차가 추가로 1개 발생한다.

다만 이 프로젝트는 출퇴근/결근을 별도로 기록하는 기능을 두지 않는다. 따라서 결근 여부를
시스템이 판단할 방법이 없다. 이를 반영해 정책을 다음과 같이 단순화한다.

- **기본값은 항상 만근**이다(결근 관리 기능이 없으므로).
- 관리자가 특정 프리랜서의 특정 평가월을 **수동으로 "만근 아님"으로 예외 지정**할 수 있고, 그렇게
  지정된 평가월만 연차가 발생하지 않는다.

또한 조사 과정에서, 원 설계 문서 5.2절이 전제하는 "매일 또는 매월 배치"가 애초에 구현되어 있지
않다는 것도 함께 확인되었다. 현재 "발생 연차"는 관리자가 프리랜서 정보 관리 화면에서 총량 숫자를
직접 입력하는 수동 조정(`applyGrantAdjustment`, 2026-08-25 문서 4장)으로만 채워지고 있다. 이
문서는 만근 규칙을 정정하는 동시에, 원래 계획되어 있던 월별 자동 발생 배치를 실제로 구현하는
범위까지 다룬다.

이 문서는 원 설계 문서를 대체하지 않고, 아래 절을 **보강/수정**한다:
- 5.2절 (연차 발생 로직 — 만근 판정 규칙 정정, 자동 배치 구현)
- 5.1절 (엔티티 — `LeaveGrant`에 `periodStart` 컬럼 추가, `AttendanceException` 엔티티 신설)
- 9장 (관리자 메뉴 — 프리랜서 정보 관리 화면에 "만근 예외 등록" 액션 추가는 별도 메뉴 신설이
  아니라 기존 화면 내 액션으로 통합)

## 2. 범위

**포함**
- `isFullAttendance` 판정 로직을 "연차 사용은 무관, 관리자 예외 지정만 영향" 규칙으로 정정
- `AttendanceException`(만근 예외) 데이터 모델 신설
- `LeaveGrant`에 `periodStart` 컬럼 추가(자동 발생 건의 멱등성 보장용)
- 매일 실행되는 Vercel Cron 배치: 오늘이 평가월 경계일인 프리랜서를 찾아 예외가 없으면 연차 1일
  자동 발생
- 프리랜서 정보 관리 화면에 "만근 예외 등록" 액션(다이얼로그) 추가
- 히스토리 타임라인에 "만근 예외" 카테고리 추가

**제외 (추후 확장 가능)**
- 결근을 별도로 기록/관리하는 출퇴근 관리 기능 자체 (이번에도, 앞으로도 이 시스템의 범위가
  아니라고 가정)
- 연차 소멸(만료) 배치 — `calculateLeaveBalance`가 매 조회 시점에 현재 사이클 기준으로 실시간
  계산하는 기존 방식(원 설계 문서 5.3~5.4절)을 그대로 유지하며, 이번 변경과 무관
- 만근 예외를 이미 지난 평가월(자동 발생이 끝난 달)에 소급 등록하는 기능 — 소급 정정이 필요하면
  기존 "연차 조정"(수동 가감) 흐름을 사용한다

## 3. 만근 판정 로직 정정 (원 설계 문서 5.2절 대체)

### 3.1 규칙

- 평가월 판정은 기존과 동일하게 입사일 기준 월 단위로 앵커링한다
  (`getMonthlyEvaluationPeriod`/`getMonthlyAnniversaryIndex`, 변경 없음).
- **만근 판정**: 해당 평가월에 대해 관리자가 등록한 `AttendanceException`이 없으면 만근으로
  인정한다. 연차(전일/반차) 사용 여부는 더 이상 만근 판정에 관여하지 않는다.
- 만근이 인정되면 `LeaveGrant` 1건(수량 1일)을 자동 생성한다.
- 예외가 등록된 평가월은 연차가 발생하지 않는다(스킵).

### 3.2 순수 함수 변경

`lib/domain/leave-grant.ts`:

```ts
export function isFullAttendance(
  hireDate: string,
  monthIndex: number,
  exceptionPeriodStarts: string[] // AttendanceException.periodStart 목록
): boolean {
  const period = getMonthlyEvaluationPeriod(hireDate, monthIndex)
  return !exceptionPeriodStarts.includes(period.start)
}
```

`approvedFullLeavePeriods`(연차 사용 기간) 파라미터는 제거한다. 기존 테스트("전일 연차가 있으면
만근 아님")는 정책에 맞지 않으므로 아래 케이스로 재작성한다.
- 예외가 없으면 만근이다.
- 해당 평가월 시작일과 일치하는 예외가 있으면 만근이 아니다.
- 다른 평가월의 예외는 영향을 주지 않는다.
- (참고용 회귀 방지) 승인된 연차 사용 데이터가 있어도 그 자체로는 만근 판정에 전달되지 않는다 —
  함수 시그니처 자체에 연차 사용 파라미터가 없으므로 호출부에서 애초에 넘길 수 없다.

## 4. 데이터 모델

### 4.1 `AttendanceException` (신규 테이블 `attendance_exceptions`)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | serial PK | |
| userId | integer, FK → users.id | 대상 프리랜서 |
| periodStart | date | 예외 처리할 평가월의 시작일. `getMonthlyEvaluationPeriod(hireDate, monthIndex).start`와 동일한 값 |
| reason | text, not null | 사유(필수) |
| createdBy | integer, FK → users.id | 등록한 관리자/결재자 |
| createdAt | timestamp | |

`(userId, periodStart)`에 unique 제약을 두어 같은 평가월에 중복 예외 등록을 방지한다.

### 4.2 `leave_grants` 컬럼 추가

| 컬럼 | 타입 | 설명 |
|---|---|---|
| periodStart | date, nullable | 자동 발생 건에만 채움(`getMonthlyEvaluationPeriod(...).start`). 수동 조정 건은 `null` |

`(userId, periodStart)`에 **partial unique 제약**(`periodStart IS NOT NULL`인 행에만 적용)을 두어,
배치가 같은 날 두 번 실행되거나 재시도되어도 같은 평가월에 대해 중복으로 연차가 발생하지 않도록
한다.

기존 `expired` 컬럼은 이번 변경과 무관하게 유지한다(현재도 실사용되지 않고
`calculateLeaveBalance`가 실시간으로 사이클을 계산함 — 이 문서의 범위 밖).

## 5. 배치(Cron) 설계

### 5.1 트리거

- Vercel Cron으로 **매일 1회**(예: KST 03:00, `vercel.json`에 UTC 기준으로 등록) 실행.
- 평가월 경계가 입사일에 앵커링되어 있어 "매월 1일"에만 도는 배치로는 개별 프리랜서의 정확한
  평가월 종료일을 맞출 수 없다. 따라서 매일 실행하며, 그날이 평가월 경계일에 해당하는 사람만
  선별해 처리한다.
- 엔드포인트: `app/api/cron/attendance-grant/route.ts`. Vercel이 보내는
  `Authorization: Bearer $CRON_SECRET` 헤더를 검증해 외부에서의 무단 호출을 차단한다
  (`CRON_SECRET` 환경변수 신규 필요).

### 5.2 처리 로직

1. `signupStatus = 'APPROVED' AND role = 'FREELANCER' AND hireDate IS NOT NULL`인 사용자 전체
   조회.
2. 각 사용자에 대해 `getMonthlyAnniversaryIndex(hireDate, today)`로 오늘이 평가월 경계일인지
   확인. `null`이면 건너뜀.
3. 경계일이면 `monthIndex`로 `periodStart = getMonthlyEvaluationPeriod(hireDate, monthIndex).start`
   계산.
4. `attendance_exceptions`에서 `(userId, periodStart)` 일치 여부 확인. 있으면 스킵(연차 미발생).
5. 없으면 `leave_grants`에 `{ userId, grantDate: today, amount: 1, cycleEnd: <현재 사이클
   종료일>, periodStart, note: '자동 발생', createdBy: null }` insert. 4.2절의 unique 제약으로
   재실행 시 중복 삽입은 DB 레벨에서 막힌다(에러는 무시하고 다음 사용자로 진행).

### 5.3 멱등성

- 같은 날 배치가 두 번 실행되어도 `(userId, periodStart)` unique 제약 덕분에 같은 평가월에는
  한 번만 발생한다.
- 배치가 하루 이상 중단되었다가 재개되는 경우: `getMonthlyAnniversaryIndex`는 정확히 "오늘"이
  경계일인 경우만 `true`를 반환하므로, 놓친 날짜는 자동으로 소급되지 않는다. 이는 이번 범위에서
  허용하는 제약으로 두고(장애 발생 시 관리자가 기존 "연차 조정" 수동 흐름으로 보정), 별도의
  소급 처리 로직은 만들지 않는다.
- 후보자 한 명을 처리하는 중 예상 못한 에러(unique 제약 위반이 아닌 에러)가 나도 그 사람만
  실패로 집계하고(`failed` 카운트) 나머지 후보자 처리는 계속 진행한다 — 한 명의 실패가 그날
  전체 배치를 중단시켜 다른 프리랜서들의 연차 발생까지 막아서는 안 되기 때문이다(전체 리뷰에서
  확인된 이슈, 2026-08-26 수정 반영).

### 5.4 입사 1년 시점(사이클 경계) 발생분 처리 — 정책 확인 완료

`getCurrentCycle`의 사이클 경계는 `asOfDate >= hireDate + N*12개월`이면 그 시점부터 이미 다음
사이클로 판정한다(경계일 당일 포함). 따라서 입사 12개월차 경계일에 배치가 발생시키는 연차
1일은, 그 경계일과 동시에 "소멸되는 1년차"가 아니라 "새로 시작되는 2년차"의 잔여연차로
집계된다.

**결과**: 1년차는 실질적으로 11일(1~11개월차 발생분)만 쌓이고 소멸하며, 2년차부터는 그 앞
사이클의 12개월차 경계 발생분(1일)이 사이클 시작과 동시에 이미 포함되어 있어 매년 정상적으로
12일이 된다(11개월차분 + 이전 사이클에서 넘어온 1일). 3년차 이후도 동일한 패턴으로 반복되어
2년차부터는 항상 12일로 일관된다.

이 동작은 설계 검토 과정에서 발견되어 사용자에게 직접 확인했고(2026-08-26), **현재 동작을
그대로 유지하기로 결정**했다 — 별도의 코드 변경 없음. 1년차에 한해 11일이 되는 것은 알려진
동작이며 버그가 아니다.

## 6. 관리자 UI — 만근 예외 등록

- 프리랜서 정보 관리 화면(`app/admin/users/page.tsx`)의 행별 액션 영역에 "만근 예외 등록" 버튼을
  추가한다.
- 클릭 시 다이얼로그(기존 `LeaveAdjustmentDialog`와 동일한 톤)를 띄운다:
  - 날짜 선택(DatePicker) — 예외 처리할 평가월에 속하는 아무 날짜나 선택. 내부적으로
    `getMonthlyEvaluationPeriod`로 해당 평가월의 `periodStart`로 환산해 저장한다.
  - 사유(필수, Textarea)
- 이미 경계일이 지나 자동 발생이 완료된 평가월은 선택할 수 없도록 제한한다(오늘 이후 평가월만
  선택 가능). 지난 달을 소급 정정해야 하면 기존 "연차 조정" 흐름을 안내한다.
- 결재자(APPROVER)는 본인이 기본 결재자로 지정된 프리랜서에 한해 이 액션을 사용할 수 있다
  (2026-08-25 문서 4장의 기존 권한 모델과 동일하게 적용).

## 7. 이력 표시

- `lib/domain/user-history.ts`의 `HistoryEntry.category`에 `'만근 예외'`를 추가하고,
  `buildHistoryTimeline`에 `attendance_exceptions` 조회 결과를 반영하는 파라미터를 추가한다.
- 표시 형식: 날짜(등록일시), 상세(해당 평가월 구간), 사유, 등록자.

## 8. 테스트 계획

- `lib/domain/leave-grant.test.ts`: 3.2절 규칙에 맞게 전면 재작성.
- 배치의 "오늘 처리 대상 판별" 부분을 순수 함수로 분리해 단위 테스트 가능하게 구현하고, 아래를
  검증한다.
  - 예외 없는 평가월 경계일 → 발생 대상에 포함
  - 예외 있는 평가월 경계일 → 발생 대상에서 제외
  - 경계일이 아닌 날 → 대상에서 제외
  - 승인 대기/거절 상태 사용자, 결재자·최고관리자 → 대상에서 제외
- 멱등성: 같은 입력으로 삽입 로직을 두 번 호출해도 두 번째는 무시되는지(unique 제약 위반을
  정상 처리하는지) 검증.

## 9. 배포 체크리스트

이 기능을 실제로 배포하려면 아래 세 가지 수동 작업이 필요하다. 하나라도 빠지면 매일 밤 실행되는
자동 연차 발생이 조용히 실패한다(에러가 눈에 띄게 표출되지 않는다).

1. **`CRON_SECRET` 환경변수 등록**: Vercel 프로젝트의 환경변수에 `CRON_SECRET`을 등록해야
   한다. 등록되지 않으면 `GET /api/cron/attendance-grant`가 매번 401을 반환하고 연차가 전혀
   발생하지 않는다.
2. **Vercel Cron Jobs 지원 요금제 확인**: `vercel.json`에 등록된 cron(`/api/cron/attendance-grant`,
   매일 UTC 18시)이 실제로 실행되려면 프로젝트가 Vercel Cron Jobs를 지원하는 요금제여야 한다.
3. **`drizzle/0003_attendance-based-leave-grant.sql` 마이그레이션 적용**: 운영 데이터베이스에
   `npx drizzle-kit migrate`(또는 동일한 SQL을 직접 실행)로 `attendance_exceptions` 테이블과
   `leave_grants.period_start` 컬럼을 반영해야 한다.
