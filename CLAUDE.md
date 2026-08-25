# CLAUDE.md

이 파일은 이 저장소에서 작업하는 Claude Code에게 프로젝트 컨텍스트와 작업 원칙을 제공합니다.

## 프로젝트 개요

프로젝트에 투입된 **프리랜서 대상 휴가 관리 웹 애플리케이션**입니다. 정규 사원용이 아닌 외부
인원(프리랜서)을 대상으로 하므로 계정 승인 절차와 결재 구조를 단순하게 유지합니다.

전체 설계는 다음 문서를 단일 진실 공급원(source of truth)으로 삼습니다. 기능을 구현하거나
비즈니스 로직에 대해 판단이 필요할 때는 반드시 이 문서를 먼저 확인하세요.

- `docs/superpowers/specs/2026-08-24-freelancer-leave-management-design.md`

설계와 다르게 구현해야 할 이유가 생기면, 코드만 바꾸지 말고 먼저 설계 문서를 갱신하거나
사용자와 논의해 반영합니다.

## 핵심 비즈니스 규칙 (요약 — 상세는 설계 문서 참조)

- **연차 발생**: 만근 시 월 1개 발생. 반차(오전/오후) 사용은 만근 판정에 영향 없음.
- **연차 소멸**: 입사 1년 시점에 잔여 연차 전체 소멸, 이후 동일 사이클 반복.
- **연차 관리 방식**: 단순 카운터가 아닌 원장(`LeaveGrant`) 방식 — 발생/사용 이력 추적 필수.
- **휴가 유형**: 연차(전일) / 오전반차 / 오후반차 (0.5일 단위, 시간 단위 계산 없음).
- **신청일수 계산**: 주말·공휴일(`Holiday` 테이블) 제외.
- **결재**: 단일 결재자 방식. `임시저장 → 제출(대기) → 승인/반려`.
- **계정**: 프리랜서 자율 회원가입 → 관리자 승인 후에만 로그인 가능.
- **역할**: 최고관리자(SUPER_ADMIN) / 결재자(APPROVER) / 프리랜서(FREELANCER) 3가지. 결재자는
  순수 관리 역할로 본인 휴가계·연차 잔액이 없다. 상세는
  `docs/superpowers/specs/2026-08-25-approver-role-and-freelancer-info-design.md` 참고.
- 다단계 결재라인, 휴가계 예약 제출, 분 단위 정밀 반차 계산은 이번 범위에서 **제외**.

## 기술 스택

- Next.js (App Router) 풀스택 단일 배포
- Postgres DB (Vercel Marketplace 연동)
- ORM: Drizzle 또는 Prisma
- 인증: 자체 이메일/비밀번호(Auth.js Credentials 등), 가입승인상태를 로그인 게이트로 사용
- UI: Tailwind CSS + shadcn/ui, datepicker 라이브러리

외부 서비스(DB, 인증 등)를 새로 붙일 때는 vercel:marketplace 스킬을 통해 프로비저닝합니다.
특정 벤더 SDK를 임의로 하드코딩하지 않습니다.

## 작업 원칙

- **실제로 완료하기**: "만들었다"는 말이 아니라 실제 동작하는 산출물을 기준으로 완료를
  선언합니다. 코드를 작성했으면 실행/테스트해서 확인한 뒤 완료라고 말합니다.
- **읽지 않은 것을 읽었다고 하지 않기**: 파일·문서를 참조해야 하는 작업에서는 실제로 읽은
  뒤 답하고, 읽지 못했다면 그 사실을 그대로 밝힙니다.
- **범위를 임의로 넓히지 않기**: 요청받지 않은 리팩터링, 기능 추가, 파일 구조 변경은 하지
  않습니다. 필요하다고 판단되면 마지막에 제안만 합니다.
- **불확실한 것은 단정하지 않기**: 설계 문서에 없는 세부 규칙을 임의로 정하지 말고, 애매하면
  사용자에게 확인하거나 설계 문서에 근거를 남깁니다.
- **비즈니스 로직 변경은 신중하게**: 연차 계산·결재 상태 전이처럼 설계 문서 5~7장에 명시된
  규칙은 코드 리뷰 없이 임의로 바꾸지 않습니다.
- 커밋 메시지, 코드 주석, 문서화는 한국어로 작성하고 변수명·함수명은 영어로 작성합니다.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
