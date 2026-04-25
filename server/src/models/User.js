import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true
    },
    createdAt: {
      type: Date,
      required: true
    },
    expiresAt: {
      type: Date,
      required: true
    },
    lastSeenAt: {
      type: Date,
      required: true
    },
    isActive: {
      type: Boolean,
      default: true
    },
    userAgent: {
      type: String,
      default: ""
    },
    browser: {
      type: String,
      default: ""
    },
    os: {
      type: String,
      default: ""
    },
    deviceType: {
      type: String,
      default: ""
    },
    ipAddress: {
      type: String,
      default: ""
    },
    fcmToken: {
      type: String,
      default: ""
    }
  },
  {
    _id: false
  }
);

const userSchema = new mongoose.Schema(
  {
    gamerTag: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    password: {
      type: String,
      required: true
    },
    lastLoginAt: {
      type: Date,
      default: null
    },
    sessions: {
      type: [sessionSchema],
      default: []
    },
    activeEntryScanner: {
      tokenId: { type: String, default: "" },
      token:   { type: String, default: "" },
      expiresAt: { type: Date, default: null },
      isActive: { type: Boolean, default: false }
    },
  },
  {
    timestamps: true
  }
);

export const User = mongoose.model("User", userSchema);
