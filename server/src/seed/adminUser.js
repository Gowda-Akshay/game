import bcrypt from "bcryptjs";
import { User } from "../models/User.js";

const getAdminCredentials = () => ({
  username: process.env.ADMIN_USERNAME || "krishna",
  password: process.env.ADMIN_PASSWORD || "123456"
});

export const ensureAdminUser = async () => {
  const { username, password } = getAdminCredentials();
  const existingUser = await User.findOne({ gamerTag: username });

  if (existingUser) {
    return existingUser;
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  return User.create({
    gamerTag: username,
    password: hashedPassword
  });
};
