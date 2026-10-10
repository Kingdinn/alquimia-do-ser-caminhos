# Google Calendar integration (optional, one-way)

This feature sends the saved calendar activities from each authenticated user's notebook to a separate **Alquimia do Ser** Google calendar owned by that person. It does not export goals, health records, images, journal prose, or review dates. It does not read other Google calendars or import Google edits into the notebook.

**Production status (2026-10-01): enabled and connected with the owner's authorized Google account.** A separate confidential OAuth client, Calendar API, encrypted server credentials and production consent audience are configured. The app created its dedicated calendar and retained the connection after reload. New installations must keep `GOOGLE_CALENDAR_ENABLED` absent/false until these prerequisites are ready; enable it for the authorized live acceptance test before opening the integration to users. Google login through Supabase alone does not supply Calendar credentials.

## Product behavior

- Each person explicitly connects and consents to `openid` and `https://www.googleapis.com/auth/calendar.app.created`.
- Normal notebook autosave remains independent. After a confirmed save, on opening the app, or on manual retry, the browser calls the authenticated sync endpoint.
- **Sync runs while the app is in use. There is no background worker or cron in this version.** If the app closes or a request fails, the next opening/retry reconciles the latest saved notebook. Do not promise closed-app retries or real-time bidirectional sync.
- Work is checkpointed in bounded batches. HTTP 202 + `needsSync:true` means continue while visible. Back off on failures and do not retry denied consent/reauthentication indefinitely.
- `syncedVersion` is the last completely processed notebook version, even when a newer save arrives during the previous request. Changes to non-calendar notebook content can advance the version without Google writes.
- Automatic sync sends changes recorded in the app. Manual sync with `{ "force": true }` also checks/reapplies copies that were deleted/changed in Google; subsequent batch requests omit force. App-owned title/time/recurrence win; PATCH preserves unrelated Google fields such as reminders and locations.
- A recurring block without `startsOn` is projected from the first connection's local date. Existing notebook history is not rewritten. Explicitly dated events and bounded recurrence retain their dates. Google recurrence uses the connection's IANA timezone.
- Disconnect deletes encrypted provider tokens and invalidates pending authorization. Existing Google calendars/events remain. Google consent is not programmatically revoked because revocation can affect other OAuth clients in the same project, including login. A person may remove the app permission separately in Google Account settings.

## Configuration (server only)

Existing values: `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

New server values:

- `GOOGLE_CALENDAR_ENABLED=true` (last, once configuration is ready for the authorized live acceptance test).
- `GOOGLE_CALENDAR_CLIENT_ID`.
- `GOOGLE_CALENDAR_CLIENT_SECRET`.
- `GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY`: exactly 32 random bytes encoded in canonical base64. Generate privately; never paste secrets into chat or source control. Keep a recoverable protected copy. Changing this key without re-encrypting existing rows requires everyone to reconnect.
- `SUPABASE_SECRET_KEY`, or legacy `SUPABASE_SERVICE_ROLE_KEY` as fallback. It is used only by the server-only Calendar module. It must never be a `NEXT_PUBLIC_` value.

Google Cloud setup:

1. Enable Google Calendar API in the appropriate OAuth project.
2. Configure a confidential web OAuth client. Register exactly `https://alquimia-do-ser-caminhos.vercel.app/api/calendar/callback` (or the actual configured site's origin). Local development may register `http://localhost:3000/api/calendar/callback` separately. Preview origins are intentionally not accepted by production origin checks.
3. Add the Calendar app-created scope to Data Access and provide an accurate public homepage/privacy policy. The policy should describe activity titles/times, encrypted tokens, Google sharing, retention and disconnect.
4. Check the scope category/verification requirements in Google Console. Do not infer exemption from this narrow scope. External Testing authorizations including Calendar can expire after seven days; finish the production audience/verification steps required for public release.
5. A separate OAuth project isolates Calendar grant revocation from sign-in grants. A different client within the same project does not provide that isolation.

Apply the reviewed `supabase/migrations/20261001090000_google_calendar.sql` once through normal migration tooling. It does not alter the journal schema or save RPC. Keep `alquimia_private` out of the Data API exposed schema list. Its new tables have RLS, no direct grants or authenticated policies. Only the `service_role` can execute the public storage RPC. The RPC never accepts the browser's claimed owner: API handlers supply the verified Supabase user ID.

No production migration/configuration or real Google calendar mutation is performed by the test suite.

## HTTP contracts

Every endpoint requires a Supabase session, including status when the feature is disabled. All mutation endpoints additionally require an exact `Origin` match and `X-Journal-Owner` equal to the session user. Responses are private/no-store; no provider token or ciphertext is returned.

- `GET /api/calendar/status` returns `{ ownerId, configured, connected, calendarName, timeZone, lastSyncedAt, syncedVersion, needsSync, syncing, errorCode }`.
- `POST /api/calendar/connect` with `{ timeZone: "America/Sao_Paulo" }` returns `{ ownerId, url }`. Navigate to the returned Google authorization URL.
- `GET /api/calendar/callback` verifies encrypted HttpOnly state, S256 PKCE, nonce, the exact Supabase session, and one-time database state. It redirects to `/?calendar=connected` or `/?calendar=<machine_error>`; raw OAuth errors/tokens never enter the URL.
- `POST /api/calendar/sync`, empty or `{ force: true }`, returns status (200 complete, 202 still pending/busy). The server reads the notebook itself; it ignores client schedules/version claims.
- `DELETE /api/calendar/connection` disconnects while retaining remote copies. If a sync lease is active it returns `calendar_busy`; retry after the active request ends.
- `POST /api/calendar/reset` with `{ confirm: true }` is an explicit repair for **calendar_missing** or **calendar_creation_uncertain** only. It clears the local calendar mapping and lets the next sync create another calendar. **Old Google copies may remain**; the UI must explain this before confirmation. It never deletes a Google calendar. A healthy connection cannot be reset using this endpoint.

Errors are `{errorCode}`. The exported `CalendarErrorCode` type in `lib/google-calendar-server.ts` is the machine-code list for localization. A type-only import is safe; never import server code into a Client Component. Session/owner failures must halt automatic sync and follow the notebook's account recovery behavior.

## Security, concurrency and failure behavior

- AES-256-GCM uses a fresh nonce and binds token ciphertext to the user ID. OAuth cookies use a separate purpose binding. Tokens are not in journal JSON, localStorage, HTTP responses or logs.
- Authorization state is consumed once and checked again atomically on credential commit. Disconnect or a newer connect attempt invalidates an in-flight old callback.
- A transactional advisory lock protects per-user storage transitions. A 45-second lease with a random fencing ID prevents simultaneous sync writers. Checkpoints renew/validate that lease before external calls; Google requests time out after eight seconds. Expired workers cannot overwrite newer database progress.
- Google event IDs are deterministic per owner/connection/block/revision. The mapping is saved before insertion; retries recover ambiguous insert outcomes without duplicating an event. Canceled IDs use a persisted new revision. Ownership markers are checked before modifying or deleting an existing event.
- Google Calendar creation does not offer the same deterministic-ID guarantee. The app records creation intent before calling Google. An ambiguous response leaves `calendar_creation_uncertain` and stops automatic creation, avoiding repeated duplicate calendars. Use the explicit repair above only after explaining retained copies.
- Reconnect to a different Google subject is refused while a connection is active. Disconnect first. Reconnecting the same Google subject retains its mapping and avoids duplicate calendars.
- Event mapping validates the complete schedule before applying event changes. Initial local times in a DST gap return `invalid_schedule_timezone`; ambiguous repeated local times choose the earlier instant. Google governs later recurrence DST behavior.
- Remote APIs and database commits are not a shared transaction. Interrupted requests may apply a Google write before acknowledgement. Stable IDs/checkpoints and subsequent reconciliation provide convergence, not distributed atomicity.
- No worker means no retry when everybody has closed the app. Adding a durable background outbox/worker is a separate enhancement; Vercel Hobby cron cannot be configured to run every minute.

## Verification before enabling

Run `node --test tests/google-calendar-*.test.mjs` and the application typecheck/build. Review migration grants and transitions before applying. Then use an explicitly consenting test account to verify: connect/denial; save→Google create/edit/delete; recurrence and timezone; manual repair; revoked grant→reconnect; logout/account switching; two tabs; application closed during a partial batch; disconnect while OAuth is pending. Verify two distinct users cannot see/change each other's integration.

Automated tests use synthetic credentials and fake provider/database boundaries. They do not prove the live Google consent configuration, migration execution, RLS permissions or production credentials. Keep the feature disabled until those checks pass.

## Official references

- [Calendar scopes](https://developers.google.com/workspace/calendar/api/auth)
- [Web-server OAuth, offline tokens and revocation](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Google OAuth production verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification)
- [Supabase social provider tokens](https://supabase.com/docs/guides/auth/social-login)
- [Google recurring events](https://developers.google.com/workspace/calendar/api/guides/recurringevents)
- [Vercel Cron plan restrictions](https://vercel.com/docs/cron-jobs/usage-and-pricing)

## Deployment verification — 2026-10-01

The private storage migration was applied successfully. The live transactional lifecycle test returned `calendar_storage_lifecycle_passed_rolled_back`; all synthetic mutations were rolled back. Direct anon/authenticated RPC execution is denied; only service_role has execute access, and both private tables have RLS enabled. The Calendar feature remains disabled until external Google configuration and live consent validation are complete.

Production release: `dpl_HTBUtkemnkbki9zRLb17c8QXLWEv`, canonical `https://alquimia-do-ser-caminhos.vercel.app/`. Typecheck, Vercel production build, and all 143 tests passed. Real notebook browser verification showed the existing 10 goals, disabled save button with autosave active, translated UI, and truthful Calendar preparation state. No real Google calendar or event was created during verification.

## Private Vercel provisioning helper

`scripts/configure-google-calendar.mjs` is tied to the existing `din-dafc / alquimia-do-ser-caminhos` project and uses the already-authenticated cached Vercel CLI. It does not search browser profiles, password stores or unrelated credentials. The default command is read-only:

```sh
/usr/local/bin/node scripts/configure-google-calendar.mjs
```

It captures CLI output and prints only production variable **names**. CLI 60's `env ls --json` includes readable values, so the helper deliberately does not use it. It also verifies the local `.vercel/project.json` matches the intended project.

After obtaining the authorized inputs, store them outside the uploaded app directory in private owner-only files (`chmod 600`), preferably in a directory with mode `700`:

- Google: the downloaded web OAuth client JSON with `web.client_id`, `web.client_secret`, and `web.redirect_uris` containing the exact production Calendar callback.
- Supabase: a JSON object with `project_ref` equal to this app's project and either `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`. Do not supply a publishable/anon key. Legacy JWT metadata is checked for the matching project and `service_role`; modern secret keys require the explicit matching `project_ref`.
- Encryption key: choose a private JSON file location. If the production variable is missing, an existing valid key file is reused or 32 random bytes are generated and stored there with mode `600` before submission. If production already has the key, no replacement key is generated and its value is never overwritten.

Paths in this example are placeholders, not files to create inside the app:

```sh
/usr/local/bin/node scripts/configure-google-calendar.mjs --apply \
  --google-client /ABSOLUTE/PRIVATE/google-web-client.json \
  --supabase-secret /ABSOLUTE/PRIVATE/supabase-server-key.json \
  --key-file /ABSOLUTE/PRIVATE/calendar-encryption.json
```

Each missing value is passed directly through child-process stdin to `vercel env add NAME production --sensitive --yes --scope din-dafc --project <linked-project-id>`. Values are never command arguments, terminal output, shell interpolation, source files, or app-local environment files. Raw CLI errors are suppressed. The helper never uses `--force`, never overwrites existing secrets and rechecks names before each addition. Existing remote values are intentionally not read or compared; ensure any previously configured OAuth ID/secret pair belongs together. Use one operator and the same private key-file path for retries.

Only after the reviewed migration/configuration steps are ready, explicitly activate:

```sh
/usr/local/bin/node scripts/configure-google-calendar.mjs --apply --enable
```

That command needs no input paths when all required variable names already exist. The feature flag is the only variable the helper may update. A **new production deployment is still required**; this helper never deploys or accesses a user's Google Calendar. Keep the private key backup, and handle/delete the downloaded credential JSON files according to the user's secret-storage preference. Do not move them into the repository.

### Small live end-to-end check without fake goals

Use an explicitly consenting signed-in app account. Save no example goals or journal prose. Connect Calendar, then create one clearly named temporary **calendar activity** (no linked goal), record its exact block ID, and wait for both notebook-save and Calendar-sync confirmation. Verify one matching event in the dedicated Google calendar, change its time/title in the app, verify the same event was updated, then reload the app. Finally delete only that recorded test activity and confirm its Google copy disappears. Never restore an old whole-notebook snapshot: that could overwrite concurrent edits. On interruption, use the recorded ID to finish cleanup. The independent test suite covers nonce replay, account isolation, leases and network errors without touching real accounts.

## Activation and live verification — 2026-10-01

Production deployment `dpl_9LVQY8uFDNN2N2JDuC5Pzqi8oeAF` is READY and promoted to the canonical app URL. Calendar API is enabled in `tidy-bliss-510015-f7`; a separate web client uses the exact Calendar callback. The Google audience is **In production**. Google Console classifies the two requested scopes as non-sensitive and states data-access verification is not required. Branding is not yet verified, so the Google consent screen identifies the app by its canonical hostname. The existing Supabase sign-in client remains unchanged.

All required server variables are stored as sensitive production variables in Vercel. The existing service-role credential is used; encrypted tokens and the encryption key never enter browser responses. A protected local recovery copy is retained outside the app upload directory, and the duplicate credential download was removed.

The owner completed real Google consent. Browser verification confirmed the dedicated calendar, successful initial synchronization, connection persistence after reload, and manual synchronization. The saved notebook remained version 98 with its 10 existing goals and zero scheduled activities.

The optional `scripts/live-google-calendar-smoke.mjs` then used the real encryption, mapping and reconciliation helpers against Google. It verified refresh-token renewal, Google account identity, dedicated-calendar identity, and creation/update/deletion of one private synthetic event. All checks and cleanup passed. Its mapping stayed in memory; the storage RPC was read-only and the notebook was never changed. This is a real **provider integration** test, not a claim that a new app activity was saved during this session. Six mocked safety tests cover the harness; five tests cover credential provisioning. The previously deployed 143 application tests and the new production TypeScript/build also passed.

The smoke helper runs without network access or credential reads unless explicitly passed `--run` or `--cleanup`. It accepts an owner UUID and private Google-client, Supabase-server, encryption-key and receipt file paths. It prints booleans only, refuses another calendar/account, and cleans up only the event whose deterministic ID and private ownership marker match its receipt. Retain any failed-run receipt until cleanup is verified.
