import assert from "node:assert/strict";
import test from "node:test";
import {checkRequestOwner} from "../lib/request-owner.ts";

const request = (headers = {}) => new Request("https://example.test/api/journal", {headers});

test("rejects a stale tab after the session switches accounts without revealing either account", async () => {
  const response = checkRequestOwner(request({"X-Journal-Owner": "previous-account"}), "current-account");
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  const body = await response.json();
  assert.equal(body.code, "account_changed");
  assert.match(body.error, /rascunho/);
  assert.doesNotMatch(JSON.stringify(body), /previous-account|current-account/);
});

test("accepts matching owner headers regardless of header-name capitalization", () => {
  assert.equal(checkRequestOwner(request({"x-journal-owner": "current-account"}), "current-account"), null);
});

test("keeps older clients and standard image requests compatible when the header is absent", () => {
  assert.equal(checkRequestOwner(request(), "current-account"), null);
});

test("does not treat a provided empty or duplicated header as an absent header", () => {
  assert.equal(checkRequestOwner(request({"X-Journal-Owner": ""}), "current-account").status, 403);
  const duplicate = new Headers({"X-Journal-Owner": "current-account"});
  duplicate.append("X-Journal-Owner", "other-account");
  assert.equal(checkRequestOwner(request(duplicate), "current-account").status, 403);
});
