/*
 * Brings up the single-node replica set and creates the least-privilege
 * application user. Run by the one-shot `mongo-init` service and safe to run
 * again: every step checks its own state first.
 *
 * Why a replica set at all for a single node: multi-document transactions and
 * change streams both require one. Session-token rotation has to write the new
 * token, revoke the old family and append to the audit log atomically — without
 * transactions that becomes compensating logic in exactly the place where
 * correctness is a security property.
 */

const appUser = process.env.MONGODB_APP_USERNAME;
const appPassword = process.env.MONGODB_APP_PASSWORD;
const migrationUser = process.env.MONGODB_MIGRATION_USERNAME || 'csas_migrator';
const migrationPassword = process.env.MONGODB_MIGRATION_PASSWORD;
const dbName = process.env.MONGODB_DB || 'csas';

if (!appUser || !appPassword) {
  throw new Error('MONGODB_APP_USERNAME and MONGODB_APP_PASSWORD must be set');
}
if (!migrationPassword) {
  throw new Error('MONGODB_MIGRATION_PASSWORD must be set');
}

let status;
try {
  status = rs.status();
} catch (error) {
  if (error.codeName !== 'NotYetInitialized' && error.code !== 94) throw error;
  print('replica set not initialised — initiating rs0');
  rs.initiate({
    _id: 'rs0',
    members: [{ _id: 0, host: 'mongo:27017' }],
  });
}

if (status) {
  print(`replica set already initialised (${status.set}), leaving it alone`);
}

/* Wait for this node to become primary before writing anything. */
for (let attempt = 0; attempt < 60; attempt += 1) {
  const state = db.hello();
  if (state.isWritablePrimary) break;
  print('waiting for primary…');
  sleep(1000);
}

const target = db.getSiblingDB(dbName);
const existing = target.getUser(appUser);

if (existing) {
  print(`application user ${appUser} already exists`);
} else {
  /* readWrite on the application database only: no dbAdmin, no access to
     `admin`, no cluster rights. A leaked application credential cannot drop a
     collection's indexes, read another database, or create users. */
  target.createUser({
    user: appUser,
    pwd: appPassword,
    roles: [{ role: 'readWrite', db: dbName }],
  });
  print(`created application user ${appUser} with readWrite on ${dbName}`);
}

/*
 * A second, separate identity for schema work.
 *
 * `readWrite` deliberately does not include `collMod`, so the application user
 * can create a collection but cannot attach, change or remove a validator —
 * and cannot drop an index. That is the point: a compromised application
 * cannot quietly remove the rules that constrain it.
 *
 * The seed and any future migration therefore run as this user instead, which
 * holds `dbAdmin` on the one database. It is used by a command a human runs,
 * never by the server process, so its credential is not loaded by the running
 * application at all.
 */
const existingMigrator = target.getUser(migrationUser);

if (existingMigrator) {
  print(`migration user ${migrationUser} already exists`);
} else {
  target.createUser({
    user: migrationUser,
    pwd: migrationPassword,
    roles: [
      { role: 'readWrite', db: dbName },
      { role: 'dbAdmin', db: dbName },
    ],
  });
  print(`created migration user ${migrationUser} with readWrite + dbAdmin on ${dbName}`);
}
