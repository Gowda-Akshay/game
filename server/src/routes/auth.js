import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";

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

router.post("/login", async (req, res) => {
  try {
    const { gamerTag, password } = req.body;

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
    markExpiredSessions(user);
    user.lastLoginAt = now;
    user.sessions.push({
      sessionId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + ONE_DAY_IN_MS),
      lastSeenAt: now,
      isActive: true
    });
    await user.save();

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
      scannerActive: Boolean(user.activeEntryScanner?.isActive),
      scannerExpiresAt: user.activeEntryScanner?.isActive ? user.activeEntryScanner.expiresAt : null
    });
  } catch (error) {
    return res.status(500).json({ message: "Unable to load settings." });
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
