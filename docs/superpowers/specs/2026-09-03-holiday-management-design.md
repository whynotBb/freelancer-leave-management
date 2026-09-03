# 공휴일 관리 기능 Design

이 문서는 관리자가 공휴일을 등록/삭제하는 화면과, 연차 신청 달력에 주말·공휴일을 색으로
표시하는 기능을 다룬다. 단일 진실 공급원 문서
(`docs/superpowers/specs/2026-08-24-freelancer-leave-management-design.md`) 9장에 이미
"관리자 메뉴 > 공휴일 관리"로 계획되어 있었으나 지금까지 미구현 상태였다.

## 1. 범위

- 관리자(최고관리자 전용)가 공휴일을 등록/삭제하는 화면(`/admin/holidays`)
- 신정처럼 매년 같은 월/일에 반복되는 공휴일을 "매년 반복"으로 한 번만 등록하면 이후
  연도에도 자동 적용되는 기능
- 설날·추석처럼 음력 기준이라 매년 날짜가 바뀌는 공휴일은 매번 새로 등록(반복 아님)
- 연차 신청 모달(연차/반차 날짜 선택기)의 달력에서 토요일/일요일/공휴일을 색으로 구분
  표시

**범위 밖**: 공휴일 데이터를 외부 API(공공데이터포털 등)에서 자동 동기화하는 기능,
분 단위 근무시간 계산, 신청일수 계산 로직 자체의 변경(이미 주말은 `isWeekend`로,
공휴일은 `holidayDates` Set으로 정상 제외되고 있음 — 이번 작업은 그 Set을 채우는
관리 화면과, 이미 계산에 쓰이는 데이터를 달력에도 보여주는 표시 기능이다). 등록된
공휴일의 필드(날짜/이름/반복 여부)를 수정하는 기능도 이번 이터레이션에서는 범위
밖이다 — 값을 바꾸려면 삭제 후 재등록해야 한다(향후 개선 후보로 의도적으로
보류한 것이며 결함이 아니다).

## 2. 데이터 모델

`holidays` 테이블(`lib/db/schema.ts`)에 컬럼 하나를 추가한다.

```ts
export const holidays = pgTable('holidays', {
  id: serial('id').primaryKey(),
  date: date('date', { mode: 'string' }).notNull().unique(),
  name: varchar('name', { length: 100 }).notNull(),
  isRecurring: boolean('is_recurring').notNull().default(false), // 신규
})
```

- `date`는 계속 "특정 연도의 실제 날짜"를 저장한다. 반복 공휴일도 최초 등록 시점의
  날짜(예: 신정 → `2026-01-01`)를 그대로 저장하고, `isRecurring=true`일 때 이 날짜의
  **월/일만** 매년 재사용한다. `date` 자체는 여전히 연도 하나만 표현하므로 스키마가
  단순하게 유지된다.
- `date`의 `unique()` 제약은 그대로 둔다. 반복 공휴일도 등록 레코드는 연도당(정확히는
  최초 등록 시점 기준) 하나면 되고, 서로 다른 두 공휴일이 같은 날짜를 가리키는 경우는
  없다고 가정한다.
- 마이그레이션: `drizzle/0007_holiday-recurrence.sql` (drizzle-kit generate로 생성).

## 3. 휴일 판정 로직

`lib/domain/holidays.ts`(신규)에 순수 함수를 추가하고 TDD로 작성한다.

```ts
export interface HolidayRow {
  date: string        // 'YYYY-MM-DD', 반복이면 최초 등록 연도의 날짜
  name: string
  isRecurring: boolean
}

// hireDate 파라미터가 없는 순수 함수 — asOfYear를 기준으로 [asOfYear - yearsBefore,
// asOfYear + yearsAfter] 범위에 걸쳐 반복 공휴일의 월/일을 투영하고, 비반복 공휴일은
// 저장된 날짜를 그대로 포함한 Set을 반환한다.
export function expandHolidayDates(
  rows: HolidayRow[],
  asOfYear: number,
  yearsBefore: number,
  yearsAfter: number
): Set<string>
```

`lib/db/holidays.ts`의 `getHolidayDates()`는 이 함수를 이용해 확장한다.

```ts
export async function getHolidayDates(): Promise<Set<string>> {
  const rows = await db.select(...).from(holidays)
  const currentYear = new Date().getFullYear()
  return expandHolidayDates(rows, currentYear, 1, 2)
}
```

`yearsBefore=1, yearsAfter=2`로 잡는 이유: 연차 신청 가능 범위가 "오늘 기준 1개월 전
~ 내년 말"(`isBeyondBackdateLimit`, `maxLeaveDate`)이므로 연도 경계 부근의 신청도
넉넉히 커버해야 한다. 이 범위는 신청 가능 기간 정책이 바뀌면 함께 재검토한다.

## 4. 관리자 화면 (`/admin/holidays`, 최고관리자 전용)

기존 관리자 화면들과 동일한 레이아웃 관례(`PageHeader`, `Table`+모바일 카드 반응형,
`ConfirmDialog`로 삭제 확인)를 따른다.

- 사이드바 `ADMIN_LINKS`(`components/app-sidebar.tsx`)에 추가:
  `{ href: '/admin/holidays', label: '공휴일 관리', icon: CalendarDaysIcon, roles: ['SUPER_ADMIN'] }`
- 페이지 상단에 안내 문구를 고정 표시한다: "신정처럼 매년 같은 날짜인 공휴일은 '매년
  반복'으로 등록하면 이후 연도에도 자동 적용됩니다. 설날·추석처럼 음력 기준이라 매년
  날짜가 바뀌는 공휴일은 매년 새로 등록해야 합니다."
- **매년 반복 공휴일** 섹션: `isRecurring=true`인 행만, 연도 필터 없이 항상 전체 표시
  (월/일 · 이름 · 삭제 버튼). 표시 정렬은 월/일 오름차순.
- **특정 연도 공휴일** 섹션: `isRecurring=false`인 행을 연도 select로 필터링해 표시
  (날짜 · 이름 · 삭제 버튼). 연도 select는 `내 문서` 화면의 연도 필터와 동일한 패턴
  (등록된 데이터에서 연도 목록을 뽑아 구성, 기본값은 "전체" — `내 문서` 화면의 연도
  필터와 동일하게 특정 연도로 미리 좁혀두지 않는다).
- "공휴일 추가" 버튼 → Dialog(`HolidayFormDialog`, 신규):
  - 반복 여부: 라디오 또는 스위치 두 개("매년 반복" / "특정 날짜")
  - 날짜: `DatePicker` — 반복 선택 시에도 연도 하나를 포함한 완전한 날짜를 고르게 하고
    (그 연도의 월/일을 반복 기준으로 저장), UI 문구로 "선택한 날짜의 월/일이 매년
    반복 적용됩니다"라고 안내한다. 달력의 연도 상한(`maxDate`)은 `getHolidayDates()`의
    투영 범위(3장)와 반드시 같은 값을 유지해야 한다 — 둘 다 `lib/domain/holidays.ts`의
    `HOLIDAY_PROJECTION_YEARS_AFTER` 상수 하나를 참조하므로, 한쪽만 바꾸는 변경은
    하지 않는다.
  - 이름: `Input` (필수)
  - 저장 시 `POST /api/admin/holidays` 호출
- 삭제는 행마다 휴지통 버튼 → `ConfirmDialog`(기존 컴포넌트 재사용) → `DELETE
  /api/admin/holidays/[id]`

## 5. API

`lib/auth/session.ts`의 `requireSuperAdmin()`을 그대로 사용한다(기존 관리자 API와
동일 패턴, 예: `app/api/admin/departures/route.ts`).

- `GET /api/admin/holidays` — 전체 목록 반환(반복/비반복 모두, 최신순 또는 월일순은
  클라이언트에서 정렬)
- `POST /api/admin/holidays` — `{ date, name, isRecurring }` 생성. `date`는
  `YYYY-MM-DD` 정규식 검증. 같은 `date`가 이미 있으면 DB unique 제약 위반을 잡아
  "이미 등록된 날짜입니다" 에러로 변환.
- `DELETE /api/admin/holidays/[id]` — 단건 삭제.

## 6. 연차 신청 달력 색상 표시

`components/date-picker.tsx`의 `DatePicker`/`DateRangePicker`에 `holidayDates?:
Set<string>` prop을 추가한다(이미 `LeaveRequestSheet`가 갖고 있는 `holidayDates`를
그대로 내려주기만 하면 됨 — 새로운 데이터 흐름이 필요 없다).

`Calendar`(react-day-picker) 호출부에 `modifiers`/`modifiersClassNames`를 추가한다:

```ts
modifiers={{
  saturday: (date) => date.getDay() === 6,
  sundayOrHoliday: (date) => date.getDay() === 0 || (holidayDates?.has(format(date, 'yyyy-MM-dd')) ?? false),
}}
modifiersClassNames={{
  saturday: 'text-blue-600 dark:text-blue-400',
  sundayOrHoliday: 'text-red-600 dark:text-red-400',
}}
```

공휴일이 토요일과 겹치는 경우 일요일/공휴일 색(빨강)을 우선한다(휴일이라는 사실이
"토요일이라는 사실"보다 신청자에게 더 중요한 정보이므로). 이미 선택된 날짜(파란
배경 pill)나 비활성화된 날짜 위에서도 글자색 유틸리티는 자연스럽게 겹쳐 보인다 —
기존 `data-selected`/`disabled` 스타일과 텍스트 색상 유틸리티가 충돌하지 않는지는
구현 중 육안으로 확인한다.

**선택 가능 여부는 바꾸지 않는다.** 공휴일도 여전히 선택 가능해야 한다(실제로 근무한
예외적인 경우를 배제하지 않기 위해서다) — 이번 변경은 순수 표시(글자색)만 다루고,
`disabled` matcher(최소/최대 날짜 제한)는 기존 로직을 그대로 둔다.

## 7. 권한

- `/admin/holidays` 페이지와 API 3개 모두 `SUPER_ADMIN`만 접근 가능. `APPROVER`는
  다른 관리자 화면(프리랜서 정보 관리)과 달리 이 메뉴에 접근할 수 없다(브레인스토밍
  단계에서 확정).

## 8. 에러 / 엣지 케이스

- 같은 날짜를 중복 등록하려는 경우: DB unique 제약 위반을 잡아 "이미 등록된
  날짜입니다" 에러 메시지로 변환해 반환한다.
- 반복 공휴일 삭제: 등록 레코드 하나만 삭제하면 그 월/일의 반복 전체가 사라진다(연도별
  레코드가 따로 있는 게 아니므로 "특정 연도만 삭제"라는 개념 자체가 없다) — UI
  삭제 확인 문구에 "매년 반복 적용이 함께 삭제됩니다"를 명시한다.
- 이미 제출/승인된 문서의 `requestedDays`는 제출 시점에 확정되어 재계산하지 않는다는
  기존 규칙(설계 문서 6장)은 이번 기능과 무관하게 그대로 유지된다 — 공휴일을 나중에
  추가/삭제해도 과거 문서의 신청일수는 바뀌지 않는다.

## 9. 테스트 계획

- `lib/domain/holidays.test.ts`(신규): `expandHolidayDates` — 반복 공휴일의 월/일이
  지정된 연도 범위에 걸쳐 올바르게 투영되는지, 비반복 공휴일은 저장된 날짜만
  포함되는지를 다룬다. 반복 공휴일이 2월 29일인 경우(실제 공휴일 중에는 없지만
  방어적으로) 평년에는 그 해 occurrence를 건너뛰고(2/28이나 3/1로 옮기지 않음)
  윤년에만 포함한다.
- 기존 `calculateRequestedDays` 관련 테스트는 변경 없음(입력이 `Set<string>`이라는
  인터페이스가 그대로이므로 영향 없음).
- API 라우트는 이 저장소의 기존 관례대로 별도 자동화 테스트 없이 수동 확인한다(다른
  관리자 API들과 동일한 패턴).
