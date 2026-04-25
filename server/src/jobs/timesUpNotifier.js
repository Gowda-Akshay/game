import cron from "node-cron";
import { Customer } from "../models/Customer.js";
import { User } from "../models/User.js";
import { Notification } from "../models/Notification.js";
import { sendPushToAll } from "../config/firebase.js";

export const startTimesUpNotifier = () => {
  // runs every minute
  cron.schedule("* * * * *", async () => {
    try {
      const now = new Date();

      const expired = await Customer.find({
        sessionStartedAt: { $ne: null },
        timesUpNotifiedAt: null,
        $or: [{ totalBookedMinutes: { $gt: 0 } }, { totalPendingMinutes: { $gt: 0 } }]
      });

      const due = expired.filter((c) => {
        const bookedMinutes = c.totalBookedMinutes || c.totalPendingMinutes || 0;
        const endTime = new Date(c.sessionStartedAt).getTime() + bookedMinutes * 60000;
        return endTime <= now.getTime();
      });

      expired.forEach(c => {
        const bookedMinutes = c.totalBookedMinutes || c.totalPendingMinutes || 0;
        const endTime = new Date(c.sessionStartedAt).getTime() + bookedMinutes * 60000;
        console.log(`[TimesUp] ${c.customerName} — booked: ${bookedMinutes}m, ends: ${new Date(endTime).toISOString()}, now: ${now.toISOString()}, expired: ${endTime <= now.getTime()}`);
      });

      console.log(`[TimesUp] Tick — candidates: ${expired.length}, due: ${due.length}`);

      if (due.length === 0) return;

      const users = await User.find({});
      const tokens = users.flatMap((u) =>
        u.sessions.filter((s) => s.isActive && s.fcmToken).map((s) => s.fcmToken)
      );
      console.log(`[TimesUp] FCM tokens found: ${tokens.length}`);

      for (const customer of due) {
        customer.timesUpNotifiedAt = now;
        await customer.save();

        const title = "⏰ Time's Up!";
        const body  = `${customer.customerName}'s session has ended.`;

        if (tokens.length > 0) {
          sendPushToAll({ tokens, title, body, data: { type: "timesup", customerId: String(customer._id) } });
        }

        // save to DB for each user so they can view it in the notifications page
        for (const u of users) {
          Notification.create({ userId: u._id, type: "timesup", title, body, data: { customerId: String(customer._id), customerName: customer.customerName } }).catch(() => {});
        }

        console.log(`[TimesUp] Notified for customer: ${customer.customerName}`);
      }
    } catch (err) {
      console.error("[TimesUp] Cron error:", err.message);
    }
  });

  console.log("[TimesUp] Notifier cron started.");
};
