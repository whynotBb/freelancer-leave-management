'use client'

import { CalendarXIcon, UserIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { LEAVE_TYPE_LABEL, sortCalendarEvents } from '@/lib/domain/calendar-utils'
import type { CalendarEventRow } from '@/lib/db/calendar'

interface CalendarListViewProps {
  events: CalendarEventRow[]
  onEventClick: (event: CalendarEventRow) => void
  year: number
  month: number
}

export function CalendarListView({ events, onEventClick, year, month }: CalendarListViewProps) {
  const sortedEvents = sortCalendarEvents(events)

  function getLeaveTypeBadge(type: 'FULL' | 'AM_HALF' | 'PM_HALF') {
    switch (type) {
      case 'FULL':
        return <Badge className="bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-200 hover:bg-indigo-500/25">{LEAVE_TYPE_LABEL.FULL}</Badge>
      case 'AM_HALF':
        return <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-200 hover:bg-amber-500/25">{LEAVE_TYPE_LABEL.AM_HALF}</Badge>
      case 'PM_HALF':
        return <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-200 hover:bg-amber-500/25">{LEAVE_TYPE_LABEL.PM_HALF}</Badge>
      default:
        return <Badge variant="outline">{type}</Badge>
    }
  }

  function formatPeriod(startDate: string, endDate: string) {
    if (startDate === endDate) {
      return startDate
    }
    return `${startDate} ~ ${endDate}`
  }

  if (sortedEvents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center bg-white dark:bg-card shadow-2xs">
        <div className="flex size-14 items-center justify-center rounded-full bg-slate-100 dark:bg-muted/60 mb-4 text-muted-foreground">
          <CalendarXIcon className="size-7" />
        </div>
        <h3 className="text-base font-semibold">등록된 휴가 일정이 없습니다</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {year}년 {month}월에는 승인 완료된 프리랜서 휴가 일정이 없습니다.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
        <span>총 <strong className="font-semibold text-foreground">{sortedEvents.length}</strong>건의 휴가 일정</span>
      </div>

      {/* 데스크톱 테이블 뷰 (md 이상) - 배경색 흰색 */}
      <div className="hidden md:block rounded-xl border border-slate-200 dark:border-border bg-white dark:bg-card shadow-2xs overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50/80 dark:bg-muted/40">
            <TableRow>
              <TableHead className="w-[150px] font-semibold">휴가 기간</TableHead>
              <TableHead className="w-[140px] font-semibold">신청자</TableHead>
              <TableHead className="w-[100px] font-semibold">유형</TableHead>
              <TableHead className="w-[90px] font-semibold text-right">일수</TableHead>
              <TableHead className="font-semibold">제목 / 사유</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="bg-white dark:bg-card">
            {sortedEvents.map((evt) => (
              <TableRow
                key={evt.id}
                className="cursor-pointer hover:bg-slate-50 dark:hover:bg-accent/50 transition-colors"
                onClick={() => onEventClick(evt)}
              >
                <TableCell className="text-xs font-medium text-foreground">
                  {formatPeriod(evt.startDate, evt.endDate)}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <UserIcon className="size-3.5 text-muted-foreground" />
                    <span className="font-medium text-sm text-foreground">{evt.requesterName}</span>
                  </div>
                </TableCell>
                <TableCell>{getLeaveTypeBadge(evt.type)}</TableCell>
                <TableCell className="text-right font-medium text-sm">
                  {evt.requestedDays}일
                </TableCell>
                <TableCell className="max-w-[320px]">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-foreground truncate">{evt.title || '-'}</span>
                    {evt.reason && (
                      <span className="text-xs text-muted-foreground truncate">{evt.reason}</span>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* 모바일 카드 뷰 (md 미만) - 배경색 흰색 */}
      <div className="grid gap-3 md:hidden">
        {sortedEvents.map((evt) => (
          <Card
            key={evt.id}
            className="cursor-pointer bg-white dark:bg-card hover:border-primary/40 transition-all active:scale-[0.99] shadow-2xs"
            onClick={() => onEventClick(evt)}
          >
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {getLeaveTypeBadge(evt.type)}
                  <span className="text-xs font-semibold text-muted-foreground">
                    {evt.requestedDays}일 사용
                  </span>
                </div>
                <span className="text-xs font-semibold text-foreground">
                  {formatPeriod(evt.startDate, evt.endDate)}
                </span>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-border/60 text-sm">
                <div className="flex items-center gap-1.5 font-medium text-foreground">
                  <UserIcon className="size-3.5 text-muted-foreground" />
                  <span>{evt.requesterName}</span>
                </div>
              </div>

              {evt.title && (
                <div className="text-xs text-foreground font-medium bg-slate-50 dark:bg-muted/40 p-2 rounded-md space-y-1">
                  <div>{evt.title}</div>
                  {evt.reason && (
                    <div className="text-muted-foreground text-[11px] line-clamp-2">{evt.reason}</div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
