# NotificationBell 알림 UI 설계 문서

## 1. 배경

`notifications` 테이블과 알림 생성 로직(`createNotification`)은 이미 구현되어 있으나,
사용자가 알림을 확인할 수 있는 UI가 없다. 승인/반려, 결재자 변경 등 주요 이벤트가
발생해도 사용자는 직접 해당 페이지를 열어야만 변경 사실을 알 수 있는 상태다.

이 문서는 헤더에 벨 아이콘(`NotificationBell`) 컴포넌트를 추가하고,
Server-Sent Events(SSE)로 준실시간 알림을 표시하는 UI를 설계한다.

원 설계 문서(`2026-08-24-freelancer-leave-management-design.md`) 7장에서
"별도 후속 작업"으로 명시했던 항목이며, 이 문서는 그 상세화 문서다.

---

## 2. 화면 범위

- **위치**: `AppShell` 헤더 우측 (`ThemeToggle` 왼쪽)
- **접근 가능 역할**: 로그인한 모든 역할 (FREELANCER / APPROVER / SUPER_ADMIN)
- **진입점**: 별도 라우트 없음. 헤더에 상시 노출되는 Popover 형태
- **SSE 방식**: SSE 스트림 내에서 3초마다 DB 쿼리 (Vercel 서버리스 Node runtime)

**이번 범위에서 제외:**
- 브라우저 OS Push Notification
- 알림 삭제 기능
- 알림 타입별 필터
- 20건 초과 페이지네이션

---

## 3. 화면 구성

### 3.1 헤더 내 벨 버튼

```
[SidebarTrigger] [Separator] [Breadcrumb] ... [NotificationBell] [ThemeToggle]
```

- `BellIcon` (lucide-react) + 미읽음 수 뱃지 (1 이상일 때만 표시, 99+ 처리)
- 뱃지: 빨간 원, 우측 상단 오버레이

### 3.2 Popover 목록

```
┌────────────────────────────────┐
│ 알림              [모두 읽음]   │
├────────────────────────────────┤
│ 🔔 [아이콘] 메시지 텍스트      │
│    2분 전                      │  ← 읽지 않음: 배경 강조
├────────────────────────────────┤
│ ✉  [아이콘] 메시지 텍스트      │
│    1시간 전                    │  ← 읽음: 일반
├────────────────────────────────┤
│ (최신 20건, 이후 항목 없음)    │
└────────────────────────────────┘
```

- 각 항목 클릭 → 읽음 처리(PATCH) + 관련 페이지로 이동
- 알림 없을 때: "새 알림이 없습니다" 빈 상태 표시
- Popover 너비: `w-80` (320px)

### 3.3 알림 타입별 아이콘 & 이동 경로

| 타입 | 아이콘 | 이동 경로 |
|------|--------|-----------|
| `SIGNUP_PENDING` | `UserPlusIcon` | `/admin/users-manage` |
| `LEAVE_SUBMITTED` | `InboxIcon` | `/approvals` |
| `LEAVE_APPROVED` | `CheckCircleIcon` | `/documents` |
| `LEAVE_REJECTED` | `XCircleIcon` | `/documents` |
| `LEAVE_ADJUSTED` | `SlidersIcon` | `/documents` |
| `APPROVER_CHANGED` | `UserCogIcon` | `/documents` |

---

## 4. API

### 4.1 `GET /api/notifications/stream`

- **방식**: Server-Sent Events (SSE)
- **Runtime**: `export const runtime = 'nodejs'` (Edge 아님)
- **인증**: `requireApprovedUser()` — 미인증 시 SSE 연결 거부
- **동작**: 연결 직후 + 이후 3초마다 DB 쿼리, 변화 감지 시 이벤트 전송

**전송 포맷:**
```
event: notifications
data: {"unreadCount": 3, "items": [...최신 20건...]}
```

**항목(item) 형식:**
```json
{
  "id": 1,
  "type": "LEAVE_APPROVED",
  "message": "\"여름 휴가\" 신청이 승인되었습니다.",
  "read": false,
  "createdAt": "2026-09-17T09:00:00.000Z"
}
```

- 연결 유지: `Content-Type: text/event-stream`, `Cache-Control: no-cache`
- 탭 닫힘 등 연결 종료 시 DB 쿼리 루프 중단 (`signal.aborted` 감지)
- Vercel 타임아웃 대응: 25초마다 `: keepalive` 코멘트 전송

### 4.2 `PATCH /api/notifications/[id]/read`

- 단건 읽음 처리
- 본인 알림인지 검증 후 `read = true` 업데이트
- 응답: `{ ok: true }`

### 4.3 `PATCH /api/notifications/read-all`

- 본인의 전체 미읽음 알림을 `read = true`로 일괄 업데이트
- 응답: `{ ok: true, updatedCount: N }`

---

## 5. 데이터 계층

`lib/db/notifications.ts`에 함수 추가 (기존 `createNotification` 유지):

```ts
// 최신 20건 조회 (읽음 여부 무관)
getNotifications(userId: number): Promise<Notification[]>

// 미읽음 수
getUnreadCount(userId: number): Promise<number>

// 단건 읽음 처리 (본인 소유 검증 포함)
markAsRead(id: number, userId: number): Promise<boolean>

// 전체 읽음 처리
markAllAsRead(userId: number): Promise<number>  // 업데이트된 행 수 반환
```

**DB 쿼리 방향:**
- `getNotifications`: `WHERE recipient_id = $1 ORDER BY created_at DESC LIMIT 20`
- `getUnreadCount`: `WHERE recipient_id = $1 AND read = false COUNT(*)`
- `markAsRead`: `WHERE id = $1 AND recipient_id = $2 SET read = true`
- `markAllAsRead`: `WHERE recipient_id = $1 AND read = false SET read = true`

---

## 6. 컴포넌트 구조

### 파일 목록

| 파일 | 동작 | 책임 |
|------|------|------|
| `components/notification-bell.tsx` | 생성 | 벨 아이콘 + 뱃지 + Popover 전체 조합 |
| `components/notification-item.tsx` | 생성 | 알림 한 건 렌더링 (아이콘·메시지·시간·링크) |
| `hooks/use-notifications.ts` | 생성 | SSE 연결, 알림 상태 관리, 읽음 처리 액션 |
| `app/api/notifications/stream/route.ts` | 생성 | SSE 엔드포인트 (Node runtime) |
| `app/api/notifications/read-all/route.ts` | 생성 | 전체 읽음 API |
| `app/api/notifications/[id]/read/route.ts` | 생성 | 단건 읽음 API |
| `lib/db/notifications.ts` | 수정 | DB 쿼리 함수 4개 추가 |
| `components/app-sidebar.tsx` | 수정 | 헤더에 `<NotificationBell />` 삽입 |

### 컴포넌트 관계

```
AppShell (app-sidebar.tsx)
  └── header
        └── NotificationBell (notification-bell.tsx)
              ├── BellIcon + Badge
              └── Popover
                    ├── "모두 읽음" 버튼
                    └── NotificationItem[] (notification-item.tsx)

useNotifications (hooks/use-notifications.ts)
  ├── EventSource → /api/notifications/stream
  ├── state: { unreadCount, items }
  └── actions: markAsRead(id), markAllAsRead()
```

---

## 7. 테스트 방향

기존 컨벤션에 따라 `app/` 하위 API 라우트와 `lib/db/*`는 자동화 테스트 대상이 아니다.
`lib/domain/`에 신규 순수 함수가 생기지 않으므로 Vitest 테스트 추가 없음.

**수동 QA 체크리스트:**

1. FREELANCER로 로그인 후 결재자가 승인/반려하면 벨 뱃지 숫자가 증가하는지 (3초 이내)
2. 벨 클릭 → Popover 열림 → 읽지 않은 알림이 배경 강조 표시되는지
3. 알림 항목 클릭 → 해당 페이지로 이동 + 다시 열었을 때 읽음 상태로 변경되는지
4. "모두 읽음" 클릭 → 모든 항목이 읽음 상태로 변경 + 뱃지 사라지는지
5. APPROVER로 로그인 후 프리랜서가 휴가 신청 시 벨 뱃지가 나타나는지
6. SUPER_ADMIN으로 로그인 후 신규 가입 신청 시 `SIGNUP_PENDING` 알림이 오는지
7. 알림 없을 때 Popover에 "새 알림이 없습니다" 빈 상태가 보이는지
8. 탭 비활성화 후 다시 활성화하면 SSE가 재연결되고 최신 알림을 가져오는지
9. 로그아웃 후 `/api/notifications/stream` 직접 접근 시 에러 응답인지

---

## 8. 이번 범위에서 제외

- 브라우저 OS Push Notification
- 알림 삭제 기능
- 알림 타입별 필터
- 20건 초과 페이지네이션
- 알림 생성 지점 추가 (신규 이벤트 타입) — 기존 `createNotification` 호출 지점만 사용
