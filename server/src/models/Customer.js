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
    }
  },
  {
    timestamps: true
  }
);

export const Customer = mongoose.model("Customer", customerSchema);
