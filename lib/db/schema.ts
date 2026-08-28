import { boolean, date, integer, numeric, pgTable, serial, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: varchar('role', { length: 20 }).notNull().default('FREELANCER'), // 'SUPER_ADMIN' | 'APPROVER' | 'FREELANCER'
  signupStatus: varchar('signup_status', { length: 20 }).notNull().default('PENDING'), // 'PENDING' | 'APPROVED' | 'REJECTED' | 'RESIGNED' | 'DELETED'
  hireDate: date('hire_date', { mode: 'string' }),
  defaultApproverId: integer('default_approver_id'),
  resignedAt: timestamp('resigned_at'),
  resignReason: text('resign_reason'),
  mustChangePassword: boolean('must_change_password').notNull().default(false),
  passwordChangedAt: timestamp('password_changed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const leaveGrants = pgTable(
  'leave_grants',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => users.id),
    grantDate: date('grant_date', { mode: 'string' }).notNull(),
    amount: numeric('amount', { precision: 4, scale: 1, mode: 'number' }).notNull(),
    cycleEnd: date('cycle_end', { mode: 'string' }).notNull(),
    expired: boolean('expired').notNull().default(false),
    note: text('note'),
    createdBy: integer('created_by').references(() => users.id),
    periodStart: date('period_start', { mode: 'string' }), // 자동 발생 건에만 채움 — 배치 멱등성 보장용
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('leave_grants_user_period_unique')
      .on(t.userId, t.periodStart)
      .where(sql`${t.periodStart} IS NOT NULL`),
  ]
)

export const leaveRequests = pgTable('leave_requests', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  approverId: integer('approver_id').notNull().references(() => users.id),
  title: varchar('title', { length: 200 }).notNull(),
  startDate: date('start_date', { mode: 'string' }).notNull(),
  endDate: date('end_date', { mode: 'string' }).notNull(),
  type: varchar('type', { length: 10 }).notNull(), // 'FULL' | 'AM_HALF' | 'PM_HALF' | 'ADJUSTMENT'
  requestedDays: numeric('requested_days', { precision: 4, scale: 1, mode: 'number' }).notNull(),
  reason: text('reason').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('DRAFT'),
  rejectReason: text('reject_reason'),
  submittedAt: timestamp('submitted_at'),
  processedAt: timestamp('processed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const holidays = pgTable('holidays', {
  id: serial('id').primaryKey(),
  date: date('date', { mode: 'string' }).notNull().unique(),
  name: varchar('name', { length: 100 }).notNull(),
})

export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  recipientId: integer('recipient_id').notNull().references(() => users.id),
  type: varchar('type', { length: 30 }).notNull(), // 'SIGNUP_PENDING' | 'LEAVE_SUBMITTED' | 'LEAVE_APPROVED' | 'LEAVE_REJECTED' | 'LEAVE_ADJUSTED' | 'APPROVER_CHANGED'
  refId: integer('ref_id').notNull(), // userId(가입 알림) 또는 leaveRequestId(휴가 알림)
  message: text('message').notNull(),
  read: boolean('read').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const approverChanges = pgTable('approver_changes', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  beforeApproverId: integer('before_approver_id').references(() => users.id),
  afterApproverId: integer('after_approver_id').notNull().references(() => users.id),
  reason: text('reason').notNull(),
  changedBy: integer('changed_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const attendanceExceptions = pgTable(
  'attendance_exceptions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => users.id),
    periodStart: date('period_start', { mode: 'string' }).notNull(),
    reason: text('reason').notNull(),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('attendance_exceptions_user_period_unique').on(t.userId, t.periodStart)]
)

export const accountEvents = pgTable('account_events', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  actorId: integer('actor_id').notNull().references(() => users.id),
  action: varchar('action', { length: 20 }).notNull(),
  role: varchar('role', { length: 20 }),
  hireDate: date('hire_date', { mode: 'string' }),
  reason: text('reason'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
