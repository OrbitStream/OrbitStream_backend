import {
  boolean,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const streamStatusEnum = pgEnum("stream_status", [
  "scheduled",
  "active",
  "paused",
  "completed",
  "cancelled",
]);

export const notificationTypeEnum = pgEnum("notification_type", [
  "stream_started",
  "stream_low_balance",
  "stream_completed",
  "claim_received",
  "system_alert",
]);

export const employers = pgTable("employers", {
  id: uuid("id").defaultRandom().primaryKey(),
  walletAddress: text("wallet_address").notNull().unique(),
  orgName: text("org_name").notNull(),
  logoUrl: text("logo_url"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const employees = pgTable(
  "employees",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    walletAddress: text("wallet_address").notNull().unique(),
    displayName: text("display_name").notNull(),
    email: text("email").notNull().unique(),
    employerId: uuid("employer_id")
      .notNull()
      .references(() => employers.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    employerWalletIndex: uniqueIndex("employees_employer_wallet_unique").on(
      table.employerId,
      table.walletAddress,
    ),
  }),
);

export const streams = pgTable("streams", {
  id: integer("id").primaryKey(),
  employerId: uuid("employer_id")
    .notNull()
    .references(() => employers.id, { onDelete: "cascade" }),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => employees.id, { onDelete: "cascade" }),
  token: text("token").notNull(),
  ratePerSecond: numeric("rate_per_second", {
    precision: 36,
    scale: 18,
  }).notNull(),
  deposited: numeric("deposited", { precision: 36, scale: 18 })
    .notNull()
    .default("0"),
  withdrawn: numeric("withdrawn", { precision: 36, scale: 18 })
    .notNull()
    .default("0"),
  startTime: timestamp("start_time", { withTimezone: true }).notNull(),
  endTime: timestamp("end_time", { withTimezone: true }),
  status: streamStatusEnum("status").notNull().default("scheduled"),
  lastIndexedAt: timestamp("last_indexed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const claims = pgTable("claims", {
  id: uuid("id").defaultRandom().primaryKey(),
  streamId: integer("stream_id")
    .notNull()
    .references(() => streams.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 36, scale: 18 }).notNull(),
  txHash: text("tx_hash").notNull().unique(),
  claimedAt: timestamp("claimed_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const notifications = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull(),
  type: notificationTypeEnum("type").notNull(),
  message: text("message").notNull(),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const schema = {
  employers,
  employees,
  streams,
  claims,
  notifications,
};
