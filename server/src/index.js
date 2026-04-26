import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { connectDatabase } from "./config/db.js";
import authRoutes from "./routes/auth.js";
import customerRoutes from "./routes/customers.js";
import notificationRoutes from "./routes/notifications.js";
import gameRoutes from "./routes/games.js";
import { ensureAdminUser } from "./seed/adminUser.js";
import { startTimesUpNotifier } from "./jobs/timesUpNotifier.js";
import { initFirebase } from "./config/firebase.js";

const app = express();
const port = process.env.PORT || 5001;
const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:5173")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }

      if (
        allowedOrigins.includes(origin) ||
        /^https:\/\/game-client(?:-[a-z0-9]+)?\.onrender\.com$/i.test(origin)
      ) {
        return callback(null, true);
      }

      return callback(new Error("Origin not allowed by CORS"));
    }
  })
);
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/games", gameRoutes);

const startServer = async () => {
  try {
    await connectDatabase();
    const adminUser = await ensureAdminUser();
    console.log(`Admin login ready for ${adminUser.gamerTag}`);
    startTimesUpNotifier();
    initFirebase();
    app.listen(port, () => {
      console.log(`Server running on http://localhost:${port}`);
    });
  } catch (error) {
    console.error("Failed to start server", error.message);
    process.exit(1);
  }
};

startServer();
