import { Router } from "express";
import jwt from "jsonwebtoken";
import { Customer } from "../models/Customer.js";
import { User } from "../models/User.js";
import Game from "../models/Game.js";
import { requireAuth } from "../middleware/auth.js";
import { sendPushToAll } from "../config/firebase.js";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "change-me";

const buildCustomerNumbers = ({ pendingHours, pendingMinutes, hourlyRate }) => {
  const hours = Number(pendingHours) || 0;
  const minutes = Number(pendingMinutes) || 0;
  const rate = Number(hourlyRate);

  if (Number.isNaN(rate) || rate < 0) {
    return { error: "Hourly cost must be a valid number." };
  }

  if (hours < 0 || minutes < 0 || minutes > 59) {
    return { error: "Pending time must use valid hours and minutes." };
  }

  const totalPendingMinutes = hours * 60 + minutes;
  const pendingCost = Number(((rate / 60) * totalPendingMinutes).toFixed(2));

  return {
    pendingHours: hours,
    pendingMinutes: minutes,
    hourlyRate: rate,
    totalPendingMinutes,
    totalBookedMinutes: totalPendingMinutes,
    pendingCost
  };
};

const resolveGameSelection = async ({ gameId, gameName, hourlyRate }) => {
  if (!gameId) {
    return {
      gameId: null,
      gameName: gameName?.trim() || "",
      hourlyRate
    };
  }

  const game = await Game.findById(gameId);

  if (!game || game.isActive === false) {
    return { error: "Selected game is not available." };
  }

  return {
    gameId: game._id,
    gameName: game.name,
    hourlyRate: game.hourlyRate
  };
};

const buildCustomerQuery = ({ search = "", filter = "all", startDate, endDate }) => {
  const query = {};

  if (search) {
    query.$or = [
      { customerName: { $regex: search, $options: "i" } },
      { phoneNumber: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } }
    ];
  }

  if (filter === "with-email") {
    query.email = { $ne: "" };
  }

  if (startDate || endDate) {
    query.createdAt = {};

    if (startDate) {
      query.createdAt.$gte = new Date(`${startDate}T00:00:00.000Z`);
    }

    if (endDate) {
      query.createdAt.$lte = new Date(`${endDate}T23:59:59.999Z`);
    }
  }

  return query;
};

const formatRunningCustomer = (customerDocument) => {
  const customer = customerDocument.toObject ? customerDocument.toObject() : customerDocument;
  const bookedMinutes = customer.totalBookedMinutes || customer.totalPendingMinutes || 0;
  const bookedHours = Math.floor(bookedMinutes / 60);
  const bookedRemainderMinutes = bookedMinutes % 60;

  if (!customer.sessionStartedAt || !bookedMinutes) {
    return {
      ...customer,
      bookedHours,
      bookedMinutes: bookedRemainderMinutes,
      remainingHours: bookedHours,
      remainingMinutes: bookedRemainderMinutes,
      remainingTotalMinutes: bookedMinutes,
      spentTotalMinutes: 0,
      sessionActive: false,
      sessionExpired: false,
      sessionPending: bookedMinutes > 0
    };
  }

  const startedAt = new Date(customer.sessionStartedAt);
  const startedAtTime = startedAt.getTime();

  if (Number.isNaN(startedAtTime)) {
    return {
      ...customer,
      bookedHours,
      bookedMinutes: bookedRemainderMinutes
    };
  }

  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - startedAtTime) / 60000));
  const remainingMinutes = Math.max(0, bookedMinutes - elapsedMinutes);
  const spentTotalMinutes = Math.min(bookedMinutes, elapsedMinutes);

  return {
    ...customer,
    bookedHours,
    bookedMinutes: bookedRemainderMinutes,
    remainingHours: Math.floor(remainingMinutes / 60),
    remainingMinutes: remainingMinutes % 60,
    remainingTotalMinutes: remainingMinutes,
    spentTotalMinutes,
    sessionStartedAt: startedAt.toISOString(),
    sessionActive: remainingMinutes > 0,
    sessionExpired: remainingMinutes === 0,
    sessionPending: false
  };
};

const buildCustomerSummary = (customers) => {
  const formattedCustomers = customers.map(formatRunningCustomer);
  const totalPendingAmount = formattedCustomers.reduce((sum, customer) => sum + customer.pendingCost, 0);
  const totalPendingMinutes = formattedCustomers.reduce(
    (sum, customer) => sum + (customer.remainingTotalMinutes ?? customer.totalPendingMinutes ?? 0),
    0
  );

  return {
    totalCustomers: formattedCustomers.length,
    totalPendingAmount: Number(totalPendingAmount.toFixed(2)),
    totalPendingMinutes,
    totalPendingHours: Number((totalPendingMinutes / 60).toFixed(1)),
    customersWithEmail: formattedCustomers.filter((customer) => customer.email).length
  };
};

const createCustomerRecord = async ({
  customerName,
  phoneNumber,
  email = "",
  photoUrl = "",
  photoFit = "cover",
  photoPositionX = 50,
  photoPositionY = 50,
  photoZoom = 1,
  pendingHours,
  pendingMinutes,
  hourlyRate,
  gameId,
  gameName
}) => {
  const gameSelection = await resolveGameSelection({ gameId, gameName, hourlyRate });

  if (gameSelection.error) {
    return { error: gameSelection.error };
  }

  const customerNumbers = buildCustomerNumbers({
    pendingHours,
    pendingMinutes,
    hourlyRate: gameSelection.hourlyRate
  });

  if (customerNumbers.error) {
    return { error: customerNumbers.error };
  }

  const customer = await Customer.create({
    customerName: customerName.trim(),
    phoneNumber: phoneNumber.trim(),
    email: email?.trim() || "",
    photoUrl: photoUrl?.trim() || "",
    photoFit: photoFit === "contain" ? "contain" : "cover",
    photoPositionX: Math.min(100, Math.max(0, Number(photoPositionX) || 50)),
    photoPositionY: Math.min(100, Math.max(0, Number(photoPositionY) || 50)),
    photoZoom: Math.min(2.5, Math.max(1, Number(photoZoom) || 1)),
    gameId: gameSelection.gameId,
    gameName: gameSelection.gameName,
    sessionStartedAt: null,
    ...customerNumbers
  });

  return { customer: formatRunningCustomer(customer) };
};

const updateCustomerRecord = async (customer, payload) => {
  const {
    customerName,
    phoneNumber,
    email = "",
    photoUrl = "",
    photoFit = "cover",
    photoPositionX = 50,
    photoPositionY = 50,
    photoZoom = 1,
    pendingHours,
    pendingMinutes,
    hourlyRate,
    gameId,
    gameName
  } = payload;

  const gameSelection = await resolveGameSelection({ gameId, gameName, hourlyRate });

  if (gameSelection.error) {
    return { error: gameSelection.error };
  }

  const customerNumbers = buildCustomerNumbers({
    pendingHours,
    pendingMinutes,
    hourlyRate: gameSelection.hourlyRate
  });

  if (customerNumbers.error) {
    return { error: customerNumbers.error };
  }

  customer.customerName = customerName.trim();
  customer.phoneNumber = phoneNumber.trim();
  customer.email = email?.trim() || "";
  customer.photoUrl = photoUrl?.trim() || "";
  customer.photoFit = photoFit === "contain" ? "contain" : "cover";
  customer.photoPositionX = Math.min(100, Math.max(0, Number(photoPositionX) || 50));
  customer.photoPositionY = Math.min(100, Math.max(0, Number(photoPositionY) || 50));
  customer.photoZoom = Math.min(2.5, Math.max(1, Number(photoZoom) || 1));
  customer.gameId = gameSelection.gameId;
  customer.gameName = gameSelection.gameName;
  customer.pendingHours = customerNumbers.pendingHours;
  customer.pendingMinutes = customerNumbers.pendingMinutes;
  customer.hourlyRate = customerNumbers.hourlyRate;
  customer.totalPendingMinutes = customerNumbers.totalPendingMinutes;
  customer.totalBookedMinutes = customerNumbers.totalBookedMinutes;
  customer.pendingCost = customerNumbers.pendingCost;

  if (!customer.sessionStartedAt) {
    customer.sessionStartedAt = null;
  }

  await customer.save();
  return { customer: formatRunningCustomer(customer) };
};

router.post("/public", async (req, res) => {
  try {
    const { token, customerName, phoneNumber, photoUrl, photoFit, photoPositionX, photoPositionY, photoZoom, pendingHours, pendingMinutes, gameId } = req.body;

    if (!token) {
      return res.status(400).json({ message: "Entry token is required." });
    }

    const payload = jwt.verify(token, JWT_SECRET);

    if (payload.purpose !== "customer-entry") {
      return res.status(401).json({ message: "Invalid entry token." });
    }

    const adminUser = await User.findById(payload.adminId);

    if (
      !adminUser ||
      !adminUser.activeEntryScanner?.isActive ||
      adminUser.activeEntryScanner.tokenId !== payload.tokenId ||
      !adminUser.activeEntryScanner.expiresAt ||
      adminUser.activeEntryScanner.expiresAt <= new Date()
    ) {
      return res.status(401).json({ message: "This QR link is no longer active." });
    }

    if (!customerName?.trim() || !phoneNumber?.trim()) {
      return res.status(400).json({ message: "Customer name and phone number are required." });
    }

    const result = await createCustomerRecord({
      customerName,
      phoneNumber,
      photoUrl,
      photoFit,
      photoPositionX,
      photoPositionY,
      photoZoom,
      pendingHours,
      pendingMinutes,
      gameId,
      hourlyRate: Number(process.env.DEFAULT_HOURLY_RATE || 100)
    });

    if (result.error) {
      return res.status(400).json({ message: result.error });
    }

    return res.status(201).json({
      message: "Customer request added successfully.",
      customer: result.customer
    });
  } catch (error) {
    return res.status(401).json({ message: "This QR link has expired." });
  }
});

router.use(requireAuth);

router.get("/", async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const search = req.query.search?.trim() || "";
    const filter = req.query.filter || "all";
    const startDate = req.query.startDate?.trim() || "";
    const endDate = req.query.endDate?.trim() || "";
    const query = buildCustomerQuery({ search, filter, startDate, endDate });

    let customers = [];
    let totalCount = 0;
    let safePage = 1;
    const [allCustomers, matchingCustomers] = await Promise.all([
      Customer.find().sort({ createdAt: -1 }),
      filter === "high-pending" ? Customer.find(query).sort({ createdAt: -1 }) : Promise.resolve([])
    ]);

    if (filter === "high-pending") {
      const formattedMatchingCustomers = matchingCustomers
        .map(formatRunningCustomer)
        .filter((customer) => customer.pendingCost >= 100);

      totalCount = formattedMatchingCustomers.length;
      safePage = totalCount === 0 ? 1 : Math.min(page, Math.max(1, Math.ceil(totalCount / limit)));
      customers = formattedMatchingCustomers.slice((safePage - 1) * limit, safePage * limit);
    } else {
      totalCount = await Customer.countDocuments(query);
      safePage = totalCount === 0 ? 1 : Math.min(page, Math.max(1, Math.ceil(totalCount / limit)));
      const pagedCustomers = await Customer.find(query)
        .sort({ createdAt: -1 })
        .skip((safePage - 1) * limit)
        .limit(limit);

      customers = pagedCustomers.map(formatRunningCustomer);
    }

    return res.json({
      customers,
      page: safePage,
      limit,
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / limit)),
      summary: buildCustomerSummary(allCustomers)
    });
  } catch (error) {
    return res.status(500).json({ message: "Unable to load customers." });
  }
});

router.get("/export", async (req, res) => {
  try {
    const search = req.query.search?.trim() || "";
    const filter = req.query.filter || "all";
    const startDate = req.query.startDate?.trim() || "";
    const endDate = req.query.endDate?.trim() || "";
    const query = buildCustomerQuery({ search, filter, startDate, endDate });

    let customers = (await Customer.find(query).sort({ createdAt: -1 })).map(formatRunningCustomer);

    if (filter === "high-pending") {
      customers = customers.filter((customer) => customer.pendingCost >= 100);
    }

    return res.json({
      customers
    });
  } catch (error) {
    return res.status(500).json({ message: "Unable to export customers." });
  }
});

router.put("/:customerId", async (req, res) => {
  try {
    const { customerName, phoneNumber, email, photoUrl, photoFit, photoPositionX, photoPositionY, photoZoom, pendingHours, pendingMinutes, hourlyRate, gameId, gameName } = req.body;

    if (!customerName?.trim() || !phoneNumber?.trim()) {
      return res.status(400).json({ message: "Customer name and phone number are required." });
    }

    const customer = await Customer.findById(req.params.customerId);

    if (!customer) {
      return res.status(404).json({ message: "Customer not found." });
    }

    const result = await updateCustomerRecord(customer, {
      customerName,
      phoneNumber,
      email,
      photoUrl,
      photoFit,
      photoPositionX,
      photoPositionY,
      photoZoom,
      pendingHours,
      pendingMinutes,
      hourlyRate,
      gameId,
      gameName
    });

    if (result.error) {
      return res.status(400).json({ message: result.error });
    }

    return res.json({
      message: "Customer updated successfully.",
      customer: result.customer
    });
  } catch (error) {
    return res.status(500).json({ message: "Unable to update customer." });
  }
});

router.post("/", async (req, res) => {
  try {
    const { customerName, phoneNumber, email, photoUrl, photoFit, photoPositionX, photoPositionY, photoZoom, pendingHours, pendingMinutes, hourlyRate, gameId, gameName } = req.body;

    if (!customerName?.trim() || !phoneNumber?.trim()) {
      return res.status(400).json({ message: "Customer name and phone number are required." });
    }

    const result = await createCustomerRecord({
      customerName,
      phoneNumber,
      email,
      photoUrl,
      photoFit,
      photoPositionX,
      photoPositionY,
      photoZoom,
      pendingHours,
      pendingMinutes,
      hourlyRate,
      gameId,
      gameName
    });

    if (result.error) {
      return res.status(400).json({ message: result.error });
    }

    return res.status(201).json({
      message: "Customer added successfully.",
      customer: result.customer
    });
  } catch (error) {
    return res.status(500).json({ message: "Unable to add customer." });
  }
});

router.post("/:customerId/activate", async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.customerId);

    if (!customer) {
      return res.status(404).json({ message: "Customer not found." });
    }

    if (!customer.sessionStartedAt) {
      customer.sessionStartedAt = new Date();
      await customer.save();
    }

    return res.json({
      message: `${customer.customerName} is now active.`,
      customer: formatRunningCustomer(customer)
    });
  } catch (error) {
    return res.status(500).json({ message: "Unable to activate customer." });
  }
});

// Called by frontend when a session just expired — sends push once and marks DB
router.post("/:id/notify-timesup", requireAuth, async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found." });
    }

    // idempotent — only notify once per session
    if (customer.timesUpNotifiedAt) {
      return res.json({ message: "Already notified." });
    }

    customer.timesUpNotifiedAt = new Date();
    await customer.save();

    const user = await User.findById(req.user.id);
    if (user) {
      const tokens = user.sessions.filter(s => s.isActive && s.fcmToken).map(s => s.fcmToken);
      sendPushToAll({
        tokens,
        title: "⏰ Time's Up!",
        body: `${customer.customerName}'s session has ended.`,
        data: { type: "timesup", customerId: String(customer._id) }
      });
    }

    return res.json({ message: "Notified." });
  } catch (error) {
    return res.status(500).json({ message: "Unable to send notification." });
  }
});

export default router;
