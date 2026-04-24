import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { connectDatabase } from "./config/db.js";
import authRoutes from "./routes/auth.js";
import customerRoutes from "./routes/customers.js";
import { ensureAdminUser } from "./seed/adminUser.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 5001;

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173"
  })
);
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/customers", customerRoutes);

const startServer = async () => {
  try {
    await connectDatabase();
    const adminUser = await ensureAdminUser();
    console.log(`Admin login ready for ${adminUser.gamerTag}`);
    app.listen(port, () => {
      console.log(`Server running on http://localhost:${port}`);
    });
  } catch (error) {
    console.error("Failed to start server", error.message);
    process.exit(1);
  }
};

startServer();
