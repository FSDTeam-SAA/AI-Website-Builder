import { auth } from "@clerk/nextjs/server";

const unlimitedUsage = {
  consumedPoints: 0,
  remainingPoints: Number.MAX_SAFE_INTEGER,
  msBeforeNext: 0,
  unlimited: true,
};

export async function getUsageStatus() {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("User not authenticated");
  }

  return unlimitedUsage;
};
