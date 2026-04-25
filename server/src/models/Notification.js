import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    type: {
      type: String,
      enum: ["login", "timesup"],
      required: true
    },
    title: { type: String, required: true },
    body:  { type: String, required: true },
    data:  { type: mongoose.Schema.Types.Mixed, default: {} },
    isRead: { type: Boolean, default: false }
  },
  { timestamps: true }
);

export const Notification = mongoose.model("Notification", notificationSchema);
