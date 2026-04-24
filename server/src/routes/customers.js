import { Router } from "express";
import jwt from "jsonwebtoken";
import { Customer } from "../models/Customer.js";
import { User } from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";

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

  return {
    ...customer,
    bookedHours,
    bookedMinutes: bookedRemainderMinutes,
    remainingHours: Math.floor(remainingMinutes / 60),
    remainingMinutes: remainingMinutes % 60,
    remainingTotalMinutes: remainingMinutes,
    sessionStartedAt: startedAt.toISOString(),
    sessionActive: remainingMinutes > 0,
    sessionExpired: remainingMinutes === 0,
    sessionPending: false
  };
};

const createCustomerRecord = async ({
  customerName,
  phoneNumber,
  email = "",
  photoUrl = "",
  pendingHours,
  pendingMinutes,
  hourlyRate
}) => {
  const customerNumbers = buildCustomerNumbers({ pendingHours, pendingMinutes, hourlyRate });

  if (customerNumbers.error) {
    return { error: customerNumbers.error };
  }

  const customer = await Customer.create({
    customerName: customerName.trim(),
    phoneNumber: phoneNumber.trim(),
    email: email?.trim() || "",
    photoUrl: photoUrl?.trim() || "",
    sessionStartedAt: null,
    ...customerNumbers
  });

  return { customer: formatRunningCustomer(customer) };
};

router.post("/public", async (req, res) => {
  try {
    const { token, customerName, phoneNumber, photoUrl, pendingHours, pendingMinutes } = req.body;

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
      pendingHours,
      pendingMinutes,
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

router.get("/", async (_req, res) => {
  try {
    const customers = await Customer.find().sort({ createdAt: -1 });
    return res.json({ customers: customers.map(formatRunningCustomer) });
  } catch (error) {
    return res.status(500).json({ message: "Unable to load customers." });
  }
});

router.post("/", async (req, res) => {
  try {
    const { customerName, phoneNumber, email, photoUrl, pendingHours, pendingMinutes, hourlyRate } = req.body;

    if (!customerName?.trim() || !phoneNumber?.trim()) {
      return res.status(400).json({ message: "Customer name and phone number are required." });
    }

    const result = await createCustomerRecord({
      customerName,
      phoneNumber,
      email,
      photoUrl,
      pendingHours,
      pendingMinutes,
      hourlyRate
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

export default router;
