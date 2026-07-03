const email = process.env.TARGET_EMAIL;
if (!email) {
  throw new Error("TARGET_EMAIL is required");
}

const result = db.users.updateOne(
  { email },
  { $set: { role: "admin" } },
);

if (result.matchedCount !== 1) {
  throw new Error(`No user found for ${email}`);
}

print(`Admin role granted to ${email}`);
