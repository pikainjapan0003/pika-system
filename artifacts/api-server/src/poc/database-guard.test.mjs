import test from "node:test";
import assert from "node:assert/strict";
import { assertPocDatabase } from "./database-guard.mjs";

const local = "postgresql://pika_poc:synthetic@db:5432/pika_sites_poc";
const host = "pika-poc-postgres.railway.internal";
const online = local.replace("@db:", `@${host}:`);
const onlineEnv = { PIKA_PRIVATE_POC: "true", PIKA_POC_DATABASE_HOST: host };
const cases = [
  ["existing local synthetic database", local, {}, true],
  ["explicitly pinned online synthetic database", online, onlineEnv, true],
  ["online host without a pin", online, { PIKA_PRIVATE_POC: "true" }, false],
  ["online host without POC mode", online, { PIKA_POC_DATABASE_HOST: host }, false],
  ["another Railway service", online.replace(host, "other.railway.internal"), onlineEnv, false],
  ["a public database URL even when pinned", online.replace(host, "db.example.com"), { ...onlineEnv, PIKA_POC_DATABASE_HOST: "db.example.com" }, false],
  ["production database name", online.replace("/pika_sites_poc", "/production"), onlineEnv, false],
  ["production database user", online.replace("pika_poc:", "production:"), onlineEnv, false],
  ["non-PostgreSQL protocol", online.replace("postgresql:", "https:"), onlineEnv, false],
  ["missing connection", undefined, onlineEnv, false],
  ["malformed connection", "invalid connection", onlineEnv, false],
];

for (const [name, url, env, allowed] of cases) {
  test(name, t => {
    const values = { DATABASE_URL: url, PIKA_PRIVATE_POC: env.PIKA_PRIVATE_POC, PIKA_POC_DATABASE_HOST: env.PIKA_POC_DATABASE_HOST };
    for (const [key, value] of Object.entries(values)) {
      const previous = process.env[key];
      t.after(() => {
        if (previous === undefined) delete process.env[key];
        else process.env[key] = previous;
      });
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (allowed) assert.doesNotThrow(assertPocDatabase);
    else assert.throws(assertPocDatabase, /POC database/);
  });
}
