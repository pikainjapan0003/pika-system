import assert from "node:assert/strict";
import test from "node:test";

import { parseClientAuditEvent } from "./auditEventInput.ts";

test("accepts only the reviewed client audit actions and opaque targets", () => {
  assert.deepEqual(
    parseClientAuditEvent({ action: "reveal_customer_pii", target: "customer:42" }),
    { action: "reveal_customer_pii", target: "customer:42" },
  );
  assert.deepEqual(
    parseClientAuditEvent({ action: "apply_exchange_rate_reference", target: "trip" }),
    { action: "apply_exchange_rate_reference", target: "trip" },
  );
});

test("rejects unknown actions, tokens, paths, and free-form personal data", () => {
  assert.throws(
    () => parseClientAuditEvent({ action: "export_secret", target: "customer:42" }),
    /not allowed/,
  );
  assert.throws(
    () => parseClientAuditEvent({ action: "reveal_customer_pii", target: "Bearer abc.def" }),
    /safe opaque identifier/,
  );
  assert.throws(
    () => parseClientAuditEvent({ action: "reveal_customer_pii", target: "王小明" }),
    /safe opaque identifier/,
  );
});
