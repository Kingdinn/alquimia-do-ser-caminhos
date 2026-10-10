import test from "node:test";
import assert from "node:assert/strict";
import {randomBytes, createHash} from "node:crypto";
import {encryptionKey, seal, unseal, makeOAuthState, verifyOAuthState, authorizationUrl, safeEqual, CALENDAR_SCOPE, validateCalendarRequest, isTimeZone} from "../lib/google-calendar-security.ts";

test("encrypted tokens are randomized, authenticated and bound to each account and purpose", () => {
  const key = encryptionKey(randomBytes(32).toString("base64"));
  const token = {refreshToken: "test-private-provider-token", accessToken: "test-access-token"};
  const first = seal(token, key, "tokens:account-A"), second = seal(token, key, "tokens:account-A");
  assert.notEqual(first, second); assert.equal(first.includes(token.refreshToken), false);
  assert.deepEqual(unseal(first, key, "tokens:account-A"), token);
  for (const context of ["tokens:account-B", "oauth"]) assert.throws(() => unseal(first, key, context));
  assert.throws(() => unseal(first, randomBytes(32), "tokens:account-A"));
  const pieces = first.split("."); pieces[3] = (pieces[3][0] === "A" ? "B" : "A") + pieces[3].slice(1);
  assert.throws(() => unseal(pieces.join("."), key, "tokens:account-A"));
  for (const invalid of ["", "plain-text", randomBytes(24).toString("base64"), " "+key.toString("base64")]) assert.throws(() => encryptionKey(invalid));
});

test("OAuth binds nonce, account, exact login session and expiry with S256 PKCE", () => {
  const now = Date.now(), state = makeOAuthState("account-A", "session-A", "America/Sao_Paulo", now);
  assert.equal(verifyOAuthState(state, state.nonce, "account-A", "session-A", now), true);
  for (const args of [["wrong", "account-A", "session-A", now], [state.nonce, "account-B", "session-A", now], [state.nonce, "account-A", "new-session", now], [state.nonce, "account-A", "session-A", now+600000]]) {
    assert.equal(verifyOAuthState(state, ...args), false);
  }
  assert.equal(verifyOAuthState({...state, expires: Infinity}, state.nonce, "account-A", "session-A", now), false);
  const url = new URL(authorizationUrl("client", "https://example.com/api/calendar/callback", state));
  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("include_granted_scopes"), "true");
  assert.deepEqual(url.searchParams.get("scope").split(" "), ["openid", CALENDAR_SCOPE]);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("code_challenge"), createHash("sha256").update(state.verifier).digest("base64url"));
  assert.equal(url.search.includes(state.verifier), false);
  assert.equal(safeEqual("x", "é"), false);
});

test("Calendar mutations require same-origin and account-owner guard independent of body fields", () => {
  const request = headers => new Request("https://example.com/api/calendar/sync", {method: "POST", headers});
  assert.equal(validateCalendarRequest(request({Origin: "https://example.com", "X-Journal-Owner": "A"}), "A", true, "https://example.com"), null);
  assert.equal(validateCalendarRequest(request({Origin: "https://example.com"}), "A", true, "https://example.com"), "account_changed");
  assert.equal(validateCalendarRequest(request({Origin: "https://evil.test", "X-Journal-Owner": "A"}), "A", true, "https://example.com"), "invalid_origin");
  assert.equal(validateCalendarRequest(request({"X-Journal-Owner": "A"}), "A", true, "https://example.com"), "invalid_origin");
  assert.equal(validateCalendarRequest(request({Origin: "https://example.com", "X-Journal-Owner": "B"}), "A", true, "https://example.com"), "account_changed");
  assert.equal(validateCalendarRequest(new Request("https://example.com/api/calendar/status"), "A", false, "https://example.com"), null);
});

test("only recognized timezones are accepted", () => {
  for (const zone of ["America/Sao_Paulo", "Europe/Lisbon", "UTC"]) assert.equal(isTimeZone(zone), true);
  for (const zone of ["", "Mars/Olympus", "../../secrets", 10, null, Infinity]) assert.equal(isTimeZone(zone), false);
});
