import mongoose from "mongoose";

export const connectDatabase = async () => {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error("MONGODB_URI or MONGO_URI is missing in the environment variables.");
  }

  await mongoose.connect(mongoUri);
  console.log("MongoDB connected");
};
