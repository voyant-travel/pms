import { bookingPaymentSchedules } from "@voyant-travel/finance/schema"
import { notificationReminderRuns } from "@voyant-travel/notifications/schema"
import { and, eq, inArray } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

type TerminalPaymentScheduleStatus = "cancelled" | "expired"

export async function closeTerminalBookingPaymentSchedules(
  db: PostgresJsDatabase,
  bookingId: string,
  status: TerminalPaymentScheduleStatus,
) {
  const now = new Date()

  await db
    .update(bookingPaymentSchedules)
    .set({ status, updatedAt: now })
    .where(
      and(
        eq(bookingPaymentSchedules.bookingId, bookingId),
        inArray(bookingPaymentSchedules.status, ["pending", "due"]),
      ),
    )

  await db
    .update(notificationReminderRuns)
    .set({
      status: "skipped",
      errorMessage: `booking_status_${status}`,
      processedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(notificationReminderRuns.bookingId, bookingId),
        eq(notificationReminderRuns.targetType, "booking_payment_schedule"),
        eq(notificationReminderRuns.status, "queued"),
      ),
    )
}
