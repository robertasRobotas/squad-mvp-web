import { MongoClient, Db } from "mongodb";

// Cached MongoDB connection. In development the module can be re-evaluated on
// every hot reload, so we stash the client promise on globalThis to avoid
// opening a new connection pool each time.

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "squad";

if (!uri) {
  throw new Error(
    "MONGODB_URI is not set. Add it to .env.local (see .env.local example).",
  );
}

const globalForMongo = globalThis as unknown as {
  _mongoClientPromise?: Promise<MongoClient>;
  _mongoIndexesReady?: Promise<void>;
};

const client = new MongoClient(uri);
const clientPromise =
  globalForMongo._mongoClientPromise ??
  (globalForMongo._mongoClientPromise = client.connect());

async function ensureIndexes(db: Db): Promise<void> {
  if (!globalForMongo._mongoIndexesReady) {
    globalForMongo._mongoIndexesReady = (async () => {
      await db.collection("users").createIndex({ id: 1 }, { unique: true });
      await db.collection("users").createIndex({ email: 1 });
      await db.collection("games").createIndex({ id: 1 }, { unique: true });
      await db.collection("games").createIndex({ ownerUserId: 1 });
      await db.collection("games").createIndex({ "players.userId": 1 });
    })().catch(() => {
      // Index creation is best-effort; don't block requests if it races.
      globalForMongo._mongoIndexesReady = undefined;
    });
  }
  await globalForMongo._mongoIndexesReady;
}

export async function getDb(): Promise<Db> {
  const connected = await clientPromise;
  const db = connected.db(dbName);
  await ensureIndexes(db);
  return db;
}
