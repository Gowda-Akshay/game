import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";
import { sendPushToAll } from "../config/firebase.js";
import { Notification } from "../models/Notification.js";

const router = Router();
const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;
const JWT_SECRET = process.env.JWT_SECRET || "change-me";

const markExpiredSessions = (user) => {
  const now = new Date();

  user.sessions.forEach((session) => {
    if (session.expiresAt <= now) {
      session.isActive = false;
    }
  });
};

const markEntryScannerExpired = (user) => {
  if (!user.activeEntryScanner?.isActive) {
    return;
  }

  if (!user.activeEntryScanner.expiresAt || user.activeEntryScanner.expiresAt <= new Date()) {
    user.activeEntryScanner.isActive = false;
    user.activeEntryScanner.token = "";
  }
};

const buildEntryTokenPayload = (adminId, tokenId) => ({
  purpose: "customer-entry",
  adminId,
  tokenId
});

const getClientIpAddress = (req) => {
  const forwardedFor = req.headers["x-forwarded-for"];

  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }

  if (typeof req.headers["x-real-ip"] === "string" && req.headers["x-real-ip"].trim()) {
    return req.headers["x-real-ip"].trim();
  }

  return req.ip || req.socket?.remoteAddress || "";
};

const detectBrowser = (userAgent) => {
  if (!userAgent) {
    return "Unknown";
  }

  if (userAgent.includes("Edg/")) return "Edge";
  if (userAgent.includes("OPR/") || userAgent.includes("Opera")) return "Opera";
  if (userAgent.includes("Chrome/") && !userAgent.includes("Edg/")) return "Chrome";
  if (userAgent.includes("Firefox/")) return "Firefox";
  if (userAgent.includes("Safari/") && !userAgent.includes("Chrome/")) return "Safari";

  return "Unknown";
};

const detectOs = (userAgent) => {
  if (!userAgent) {
    return "Unknown";
  }

  if (userAgent.includes("Windows")) return "Windows";
  if (userAgent.includes("Android")) return "Android";
  if (userAgent.includes("iPhone") || userAgent.includes("iPad") || userAgent.includes("iPod")) return "iOS";
  if (userAgent.includes("Mac OS X") || userAgent.includes("Macintosh")) return "macOS";
  if (userAgent.includes("Linux")) return "Linux";

  return "Unknown";
};

const detectDeviceType = (userAgent) => {
  if (!userAgent) {
    return "Unknown";
  }

  if (userAgent.includes("iPad") || userAgent.includes("Tablet")) return "Tablet";
  if (
    userAgent.includes("Mobile") ||
    userAgent.includes("Android") ||
    userAgent.includes("iPhone") ||
    userAgent.includes("iPod")
  ) {
    return "Mobile";
  }

  return "Desktop";
};

const buildSessionDeviceInfo = (req) => {
  const userAgent = req.headers["user-agent"] || "";

  return {
    userAgent,
    browser: detectBrowser(userAgent),
    os: detectOs(userAgent),
    deviceType: detectDeviceType(userAgent),
    ipAddress: getClientIpAddress(req)
  };
};

router.post("/login", async (req, res) => {
  try {
    const { gamerTag, password, fcmToken } = req.body;

    if (!gamerTag || !password) {
      return res.status(400).json({ message: "Username and password are required." });
    }

    const user = await User.findOne({ gamerTag });

    if (!user) {
      return res.status(401).json({ message: "Invalid gamer tag or password." });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid gamer tag or password." });
    }

    const sessionId = crypto.randomUUID();
    const now = new Date();
    const deviceInfo = buildSessionDeviceInfo(req);
    markExpiredSessions(user);
    user.lastLoginAt = now;
    user.sessions.push({
      sessionId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + ONE_DAY_IN_MS),
      lastSeenAt: now,
      isActive: true,
      fcmToken: fcmToken || "",
      ...deviceInfo
    });

    await user.save();

    // fire push notification to all registered devices (non-blocking)
    const loginTime = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    const allFcmTokens = user.sessions.filter(s => s.isActive && s.fcmToken).map(s => s.fcmToken);
    const notifTitle = "Gaming Zone — Login Alert 🎮";
    const notifBody  = `${gamerTag} logged in at ${loginTime} from ${deviceInfo.deviceType} (${deviceInfo.os})`;
    sendPushToAll({ tokens: allFcmTokens, title: notifTitle, body: notifBody, data: { type: "login", gamerTag, time: now.toISOString() } });
    Notification.create({ userId: user._id, type: "login", title: notifTitle, body: notifBody, data: { gamerTag, time: now.toISOString() } }).catch(() => {});

    const token = jwt.sign(
      { id: user._id, gamerTag: user.gamerTag, sessionId },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    return res.json({
      message: "Login successful.",
      token,
      user: {
        id: user._id,
        gamerTag: user.gamerTag,
        lastLoginAt: user.lastLoginAt
      },
      settings: {
        systemName: process.env.SYSTEM_NAME || "Gaming Zone",
        activeSessionCount: user.sessions.filter((session) => session.isActive).length
      },
      session: {
        sessionId,
        ...deviceInfo
      }
    });
  } catch (error) {
    return res.status(500).json({ message: "Server error during login." });
  }
});

router.post("/entry-link", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "Admin user not found." });
    }

    const expiresAt = new Date(Date.now() + ONE_DAY_IN_MS);
    const tokenId = crypto.randomUUID();
    const token = jwt.sign(buildEntryTokenPayload(req.user.id, tokenId), JWT_SECRET, { expiresIn: "1d" });
    user.activeEntryScanner = {
      tokenId,
      token,
      expiresAt,
      isActive: true
    };
    await user.save();

    return res.json({
      token,
      expiresAt: expiresAt.toISOString(),
      systemName: process.env.SYSTEM_NAME || "Gaming Zone",
      isActive: true
    });
  } catch (error) {
    return res.status(500).json({ message: "Unable to create entry link." });
  }
});

router.get("/entry-link/manage", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "Admin user not found." });
    }

    markEntryScannerExpired(user);
    await user.save();

    return res.json({
      isActive: Boolean(user.activeEntryScanner?.isActive),
      token: user.activeEntryScanner?.isActive ? user.activeEntryScanner.token : "",
      expiresAt: user.activeEntryScanner?.isActive ? user.activeEntryScanner.expiresAt : null,
      systemName: process.env.SYSTEM_NAME || "Gaming Zone"
    });
  } catch (error) {
    return res.status(500).json({ message: "Unable to load scanner status." });
  }
});

router.delete("/entry-link", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "Admin user not found." });
    }

    user.activeEntryScanner = {
      tokenId: "",
      token: "",
      expiresAt: null,
      isActive: false
    };
    await user.save();

    return res.json({ message: "Scanner closed successfully." });
  } catch (error) {
    return res.status(500).json({ message: "Unable to close scanner." });
  }
});

router.get("/entry-link", async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ message: "Entry token is required." });
    }

    const payload = jwt.verify(token, JWT_SECRET);

    if (payload.purpose !== "customer-entry") {
      return res.status(400).json({ message: "Invalid entry token." });
    }

    const user = await User.findById(payload.adminId);

    if (!user) {
      return res.status(401).json({ message: "This QR link has expired." });
    }

    markEntryScannerExpired(user);

    if (
      !user.activeEntryScanner?.isActive ||
      user.activeEntryScanner.tokenId !== payload.tokenId
    ) {
      await user.save();
      return res.status(401).json({ message: "This QR link is no longer active." });
    }

    await user.save();

    return res.json({
      valid: true,
      systemName: process.env.SYSTEM_NAME || "Gaming Zone",
      expiresAt: new Date(payload.exp * 1000).toISOString(),
      isActive: true
    });
  } catch (error) {
    return res.status(401).json({ message: "This QR link has expired." });
  }
});

router.get("/settings", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "Admin user not found." });
    }

    markExpiredSessions(user);
    markEntryScannerExpired(user);
    await user.save();

    return res.json({
      systemName: process.env.SYSTEM_NAME || "Gaming Zone",
      adminName: user.gamerTag,
      currentTime: new Date().toISOString(),
      lastLoginAt: user.lastLoginAt,
      activeSessionCount: user.sessions.filter((session) => session.isActive).length,
      sessions: user.sessions
        .slice()
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
        .map((session) => ({
          sessionId: session.sessionId,
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
          lastSeenAt: session.lastSeenAt,
          isActive: session.isActive,
          browser: session.browser,
          os: session.os,
          deviceType: session.deviceType,
          ipAddress: session.ipAddress,
          userAgent: session.userAgent
        })),
      scannerActive: Boolean(user.activeEntryScanner?.isActive),
      scannerExpiresAt: user.activeEntryScanner?.isActive ? user.activeEntryScanner.expiresAt : null
    });
  } catch (error) {
    return res.status(500).json({ message: "Unable to load settings." });
  }
});

// Return VAPID key — requires login so it's not publicly exposed
router.get("/vapid-key", requireAuth, (_req, res) => {
  const vapidKey = process.env.FIREBASE_VAPID_KEY;
  if (!vapidKey || vapidKey === "PASTE_VAPID_KEY_HERE") {
    return res.status(503).json({ message: "Push notifications not configured on server." });
  }
  return res.json({ vapidKey });
});

// Register / refresh an FCM token for push notifications
router.post("/fcm-token", requireAuth, async (req, res) => {
  try {
    const { fcmToken } = req.body;
    console.log("[FCM] Token received:", fcmToken ? fcmToken.slice(0, 20) + "..." : "MISSING");

    if (!fcmToken) {
      return res.status(400).json({ message: "fcmToken is required." });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const session = user.sessions.find(s => s.sessionId === req.user.sessionId);
    if (!session) {
      return res.status(404).json({ message: "Session not found." });
    }

    if (session.fcmToken !== fcmToken) {
      session.fcmToken = fcmToken;
      user.markModified("sessions");
      await user.save();
      console.log("[FCM] Token saved to session:", req.user.sessionId);
    } else {
      console.log("[FCM] Token already stored in session, skipping.");
    }

    return res.json({ message: "FCM token registered." });
  } catch (error) {
    console.error("[FCM] Save error:", error.message);
    return res.status(500).json({ message: "Unable to register FCM token." });
  }
});

router.post("/change-password", requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current password and new password are required." });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters." });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "Admin user not found." });
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);

    if (!isPasswordValid) {
      return res.status(400).json({ message: "Current password is incorrect." });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    return res.json({ message: "Password updated successfully." });
  } catch (error) {
    return res.status(500).json({ message: "Unable to change password." });
  }
});

export default router;
