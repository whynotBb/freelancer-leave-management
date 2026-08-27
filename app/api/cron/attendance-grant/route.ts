import { NextResponse } from 'next/server'
import { runDailyAttendanceGrantBatch } from '@/lib/db/attendance-grant-batch'

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const today = new Date().toISOString().slice(0, 10)
  const result = await runDailyAttendanceGrantBatch(today)
  return NextResponse.json({ ok: true, today, ...result })
}
