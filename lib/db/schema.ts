import { boolean, date, integer, numeric, pgTable, serial, text, timestamp, varchar } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: varchar('role', { length: 20 }).notNull().default('FREELANCER'), // 'ADMIN' | 'FREELANCER'
  signupStatus: varchar('signup_status', { length: 20 }).notNull().default('PENDING'), // 'PENDING' | 'APPROVED' | 'REJECTED'
  hireDate: date('hire_date', { mode: 'string' }),
  position: varchar('position', { length: 50 }),
  department: varchar('department', { length: 100 }),
  defaultApproverId: integer('default_approver_id'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const leaveGrants = pgTable('leave_grants', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  grantDate: date('grant_date', { mode: 'string' }).notNull(),
  amount: numeric('amount', { precision: 4, scale: 1, mode: 'number' }).notNull(),
  cycleEnd: date('cycle_end', { mode: 'string' }).notNull(),
  expired: boolean('expired').notNull().default(false),
  note: text('note'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const leaveRequests = pgTable('leave_requests', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  approverId: integer('approver_id').notNull().references(() => users.id),
  title: varchar('title', { length: 200 }).notNull(),
  startDate: date('start_date', { mode: 'string' }).notNull(),
  endDate: date('end_date', { mode: 'string' }).notNull(),
  type: varchar('type', { length: 10 }).notNull(), // 'FULL' | 'AM_HALF' | 'PM_HALF'
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
  type: varchar('type', { length: 30 }).notNull(), // 'SIGNUP_PENDING' | 'LEAVE_SUBMITTED' | 'LEAVE_APPROVED' | 'LEAVE_REJECTED'
  refId: integer('ref_id').notNull(), // userId(가입 알림) 또는 leaveRequestId(휴가 알림)
  message: text('message').notNull(),
  read: boolean('read').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
