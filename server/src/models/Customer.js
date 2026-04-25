import mongoose from "mongoose";

const customerSchema = new mongoose.Schema(
  {
    customerName: {
      type: String,
      required: true,
      trim: true
    },
    phoneNumber: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      trim: true,
      default: ""
    },
    photoUrl: {
      type: String,
      trim: true,
      default: ""
    },
    photoFit: {
      type: String,
      enum: ["cover", "contain"],
      default: "cover"
    },
    photoPositionX: {
      type: Number,
      default: 50,
      min: 0,
      max: 100
    },
    photoPositionY: {
      type: Number,
      default: 50,
      min: 0,
      max: 100
    },
    photoZoom: {
      type: Number,
      default: 1,
      min: 1,
      max: 2.5
    },
    pendingHours: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    },
    pendingMinutes: {
      type: Number,
      required: true,
      min: 0,
      max: 59,
      default: 0
    },
    hourlyRate: {
      type: Number,
      required: true,
      min: 0
    },
    totalPendingMinutes: {
      type: Number,
      required: true,
      min: 0
    },
    pendingCost: {
      type: Number,
      required: true,
      min: 0
    },
    sessionStartedAt: {
      type: Date,
      default: null
    },
    totalBookedMinutes: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    },
    timesUpNotifiedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

export const Customer = mongoose.model("Customer", customerSchema);
