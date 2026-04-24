import jwt from "jsonwebtoken";
import { User } from "../models/User.js";

export const requireAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Authentication required." });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "change-me");

    const user = await User.findById(decoded.id);
    const now = new Date();

    if (!user) {
      return res.status(401).json({ message: "Session expired. Please login again." });
    }

    let matchedSession = null;

    user.sessions.forEach((session) => {
      if (session.expiresAt <= now) {
        session.isActive = false;
      }

      if (session.sessionId === decoded.sessionId) {
        matchedSession = session;
      }
    });

    if (!matchedSession || !matchedSession.isActive || matchedSession.expiresAt <= now) {
      await user.save();
      return res.status(401).json({ message: "Session expired. Please login again." });
    }

    matchedSession.lastSeenAt = now;
    await user.save();

    req.user = decoded;
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token." });
  }
};
