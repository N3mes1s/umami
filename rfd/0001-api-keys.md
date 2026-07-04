# RFD 0001 — API keys (programmatic access)

- State: **accepted** (→ implemented; see commit log)
- Depends on: nothing. Everything else depends on this.

## Problem

Umami has exactly one way to call its API: `POST /api/auth/login` with a username and
password, yielding a JWT bound to the user's password hash. There is no API-key or
personal-access-token concept anywhere in the schema. That makes every programmatic
consumer — scripts, CI, the MCP server (RFD 0005), server-side collection (RFD 0006),
the jobs runner (RFD 0008) — either impossible or forced to store a login password.

## Design

### Token format

```
umami_ak_<40 hex chars>            (20 random bytes)
```

The `umami_ak_` prefix makes keys greppable in leaks and lets `checkAuth` route them
without attempting JWT decryption. Only `hash(token)` (existing sha512 helper in
`src/lib/crypto.ts`) is stored; the plaintext is shown once at creation.

### Schema (new table, additive migration `21_add_api_key`)

```prisma
model ApiKey {
  id         String    @id @map("api_key_id") @db.Uuid
  userId     String    @map("user_id") @db.Uuid
  name       String    @db.VarChar(100)
  keyHash    String    @unique @map("key_hash") @db.VarChar(128)
  keyPrefix  String    @map("key_prefix") @db.VarChar(20)   // "umami_ak_ab12" for display
  expiresAt  DateTime? @map("expires_at") @db.Timestamptz(6)
  lastUsedAt DateTime? @map("last_used_at") @db.Timestamptz(6)
  createdAt  DateTime? @default(now()) @map("created_at") @db.Timestamptz(6)
  deletedAt  DateTime? @map("deleted_at") @db.Timestamptz(6)
  @@map("api_key")
}
```

No scopes in v1: a key acts as its owning user (same permission checks as a session
token). Scopes can be added later as a nullable JSON column without migration pain.

### Auth hook

`checkAuth` (`src/lib/auth.ts`) gets one guard at the top:

```ts
if (token?.startsWith(API_KEY_PREFIX)) {
  return checkApiKeyAuth(token);   // fork-owned, src/lib/api-key.ts
}
```

`checkApiKeyAuth` looks up the key by `hash(token)` (Redis-cached when available, same
`load.ts` fetch pattern), rejects expired/deleted keys, loads the user, updates
`lastUsedAt` (fire-and-forget, throttled to once a minute), and returns the same
`{ token, user }` shape `checkAuth` returns — so every existing route and permission
check works unchanged.

### API

- `GET  /api/api-keys` — list caller's keys (no hashes, prefix only)
- `POST /api/api-keys` — `{ name, expiresAt? }` → `{ ..., key }` (plaintext, once)
- `DELETE /api/api-keys/[keyId]` — soft delete (sets `deletedAt`, evicts cache)

### UI

`Settings → API keys`: list, create dialog (shows key once with copy button), revoke.

## Merge risk

- `auth.ts`: ~3-line hook. Low.
- `prisma/schema.prisma`: one appended model. Low (append-only).
- Everything else fork-owned. **Upstream candidate** — most-requested upstream feature;
  building it cleanly gives us a PR to shrink the fork.

## Security notes

- Keys hashed at rest; constant-time comparison not required because lookup is by hash.
- Keys are rejected for share-context routes exactly like normal user tokens (they *are*
  normal user auth).
- Rate limiting of failed lookups rides on RFD 0008's future hardening; not in v1.
