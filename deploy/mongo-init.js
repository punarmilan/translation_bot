const databaseName = process.env.MONGODB_DB || "translation_bot";
const username = process.env.MONGO_APP_USERNAME;
const password = process.env.MONGO_APP_PASSWORD;

if (!username || !password) {
  throw new Error("MONGO_APP_USERNAME and MONGO_APP_PASSWORD are required");
}

const appDatabase = db.getSiblingDB(databaseName);
if (!appDatabase.getUser(username)) {
  appDatabase.createUser({
    user: username,
    pwd: password,
    roles: [{ role: "readWrite", db: databaseName }],
  });
}
