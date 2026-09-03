'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { SearchIcon } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'

export interface PolicySection {
  title: string
  items: string[]
}

export const ADMIN_POLICY_SECTIONS: PolicySection[] = [
  {
    title: '연차 발생 기준',
    items: [
      '평가월(입사일 기준 매월)에 <strong>관리자가 "만근 예외"로 등록하지 않는 한</strong> 기본적으로 만근으로 인정되어 <strong>1일</strong>이 발생합니다.',
      '연차·반차 사용 여부는 만근 판정에 영향을 주지 않습니다. 이미 발생한 연차를 정상적으로 사용하는 것은 다음 달 발생을 막지 않습니다.',
      '매일 자동으로 실행되는 배치가 그날 평가월이 마감되는 프리랜서를 찾아 발생 여부를 판정하고, 해당되면 자동으로 연차 1일을 지급합니다(수동 조작 불필요).',
    ],
  },
  {
    title: '만근 예외 등록',
    items: [
      '결근 등의 사유로 특정 평가월을 만근으로 인정할 수 없는 경우, 관리자가 프리랜서 정보 관리 화면의 <strong>"만근 예외" 버튼</strong>으로 해당 평가월을 수동 지정하면 그 달은 연차가 발생하지 않습니다.',
      '이미 자동 발생이 끝난(마감된) 평가월은 예외로 등록할 수 없습니다 — 아직 마감되지 않은 평가월만 지정 가능합니다.',
      '등록한 예외는 대상 프리랜서의 이력 패널에 "만근 예외" 항목으로 표시됩니다.',
    ],
  },
  {
    title: '연차 소멸 기준',
    items: [
      '<strong>입사일 기준 1년</strong>이 되는 시점에 그동안 쌓인 미사용 잔여 연차가 전체 소멸합니다.',
      '이후에도 동일한 발생·소멸 사이클이 계속 반복됩니다.',
    ],
  },
  {
    title: '잔여 연차 계산',
    items: [
      '<strong>잔여 연차 = 소멸되지 않은 발생 연차 합계 − 승인된 사용 연차 합계</strong>로 자동 계산됩니다.',
    ],
  },
  {
    title: '휴가 유형과 신청일수',
    items: [
      '휴가 유형은 <strong>연차(전일) / 오전반차 / 오후반차</strong> 3가지이며, 반차는 0.5일 단위로 처리됩니다.',
      '신청일수 계산 시 <strong>주말과 공휴일은 제외</strong>됩니다.',
    ],
  },
  {
    title: '결재 흐름',
    items: [
      '휴가 신청은 <strong>임시저장 → 제출(대기) → 승인/반려</strong> 순으로 진행되며, 결재자는 한 명입니다.',
      '신청인은 <strong>대기 상태</strong>에서만 직접 취소할 수 있고, 승인 후 취소는 관리자만 처리할 수 있습니다.',
    ],
  },
  {
    title: '역할 안내',
    items: [
      '<strong>최고관리자(SUPER_ADMIN)</strong>: 전체 프리랜서·결재자 정보와 계정 승인을 관리합니다.',
      '<strong>결재자(APPROVER)</strong>: 담당 프리랜서의 휴가 신청을 승인/반려하는 순수 관리 역할로, 본인의 휴가계·연차 잔액은 없습니다.',
      '<strong>프리랜서(FREELANCER)</strong>: 휴가를 신청하고 본인 연차 현황을 확인합니다.',
    ],
  },
  {
    title: '계정 승인 절차',
    items: [
      '프리랜서가 직접 회원가입하면 <strong>승인 대기 상태</strong>가 되며, 이 상태에서는 로그인할 수 없습니다.',
      '관리자가 승인해야만 로그인 및 서비스 이용이 가능합니다.',
    ],
  },
  {
    title: '[프리랜서 정보관리] 이용 방법',
    items: [
      '<strong>입사일</strong>: 날짜 선택기로 입사일을 지정하거나 변경합니다.',
      '<strong>기본 결재자</strong>: 검색 콤보박스로 해당 프리랜서의 담당 결재자를 지정합니다.',
      '<strong>발생/사용 연차</strong>: 직접 숫자를 수정할 수 있으며, 수정 시 사유 입력이 필요합니다.',
      '<strong>잔여 연차</strong>: 발생/사용 값을 기반으로 자동 계산되는 읽기 전용 값입니다.',
      '<strong>만근 예외</strong>: 아직 마감되지 않은 평가월을 만근 아님으로 지정해 그 달 자동 발생을 막습니다.',
      '결재자(APPROVER) 계정은 본인이 기본 결재자로 지정된 프리랜서 행만 수정할 수 있습니다.',
    ],
  },
]

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function highlightQuery(text: string, query: string, keyPrefix: string) {
  if (!query) return text
  const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, 'gi'))
  if (parts.length === 1) return text
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark key={`${keyPrefix}-${i}`} className="rounded-sm bg-yellow-200 px-0.5 text-foreground dark:bg-yellow-500/40">
        {part}
      </mark>
    ) : (
      part
    )
  )
}

function renderItem(text: string, query: string, keyPrefix: string) {
  return text.split(/(<strong>.*?<\/strong>)/g).map((part, i) => {
    const match = part.match(/^<strong>(.*)<\/strong>$/)
    const isStrong = !!match
    const content = isStrong ? match[1] : part
    const highlighted = highlightQuery(content, query, `${keyPrefix}-${i}`)
    return isStrong ? (
      <strong key={i} className="font-semibold text-foreground">
        {highlighted}
      </strong>
    ) : (
      <span key={i}>{highlighted}</span>
    )
  })
}

interface PolicyInfoSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  sections: PolicySection[]
}

export function PolicyInfoSheet({ open, onOpenChange, title, description, sections }: PolicyInfoSheetProps) {
  const [query, setQuery] = useState('')
  const contentRef = useRef<HTMLDivElement>(null)
  const sectionRefs = useRef<(HTMLElement | null)[]>([])

  // 매칭 검색어 판단용으로 <strong> 태그를 제거한 평문을 섹션별로 미리 만들어 둔다.
  const sectionPlainText = useMemo(
    () =>
      sections.map(
        (section) => `${section.title} ${section.items.join(' ')}`.replace(/<\/?strong>/g, '').toLowerCase()
      ),
    [sections]
  )

  function handleOpenChange(next: boolean) {
    if (!next) setQuery('')
    onOpenChange(next)
  }

  useEffect(() => {
    const trimmed = query.trim().toLowerCase()
    if (!trimmed) return
    const firstMatchIndex = sectionPlainText.findIndex((text) => text.includes(trimmed))
    if (firstMatchIndex === -1) return
    sectionRefs.current[firstMatchIndex]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [query, sectionPlainText])

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="data-[side=right]:w-[95vw] data-[side=right]:sm:max-w-none min-[560px]:data-[side=right]:w-[max(480px,32vw)]">
        <SheetHeader className="border-b border-border">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
          <div className="relative mt-2">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="안내 내용 검색"
              className="pl-8"
            />
          </div>
        </SheetHeader>
        <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          <div className="space-y-5">
            {sections.map((section, sectionIndex) => (
              <section
                key={section.title}
                ref={(el) => {
                  sectionRefs.current[sectionIndex] = el
                }}
              >
                <h3 className="text-sm font-semibold text-foreground">
                  {highlightQuery(section.title, query.trim(), `title-${sectionIndex}`)}
                </h3>
                <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {section.items.map((item, i) => (
                    <li key={i}>{renderItem(item, query.trim(), `item-${sectionIndex}-${i}`)}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
