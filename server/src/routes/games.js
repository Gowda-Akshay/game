import express from "express";
import Game from "../models/Game.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

// List all games
router.get("/", requireAuth, async (_req, res) => {
  try {
    const games = await Game.find().sort({ createdAt: -1 });
    return res.json({ games });
  } catch {
    return res.status(500).json({ message: "Failed to load games." });
  }
});

// Create game
router.post("/", requireAuth, async (req, res) => {
  try {
    const { name, hourlyRate } = req.body;
    if (!name || hourlyRate == null) return res.status(400).json({ message: "Name and hourlyRate are required." });
    const game = await Game.create({ name: name.trim(), hourlyRate: Number(hourlyRate) });
    return res.status(201).json({ game });
  } catch {
    return res.status(500).json({ message: "Failed to create game." });
  }
});

// Update game
router.put("/:id", requireAuth, async (req, res) => {
  try {
    const { name, hourlyRate, isActive } = req.body;
    const game = await Game.findByIdAndUpdate(
      req.params.id,
      { ...(name && { name: name.trim() }), ...(hourlyRate != null && { hourlyRate: Number(hourlyRate) }), ...(isActive != null && { isActive }) },
      { new: true }
    );
    if (!game) return res.status(404).json({ message: "Game not found." });
    return res.json({ game });
  } catch {
    return res.status(500).json({ message: "Failed to update game." });
  }
});

// Delete game
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    await Game.findByIdAndDelete(req.params.id);
    return res.json({ message: "Game deleted." });
  } catch {
    return res.status(500).json({ message: "Failed to delete game." });
  }
});

export default router;
