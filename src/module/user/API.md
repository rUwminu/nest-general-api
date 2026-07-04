# User API

All routes are under `/user` and require authentication (global `AuthGuard`), unless
otherwise noted. Endpoints marked **Admin** additionally require `role: ADMIN`.

Every response is wrapped by the global response interceptor:

```json
{
  "statusCode": 200,
  "message": "...",
  "data": { ... }
}
```

Validation failures return `400` with:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": [
    {
      "property": "q",
      "message": "q must be longer than or equal to 1 characters"
    }
  ]
}
```

---

## Auth (Better Auth) — not a controller in this codebase

`POST /api/auth/sign-up/email` and `POST /api/auth/sign-in/email` aren't handled by
`UserController` — they're mounted directly by the Better Auth library
(`AuthModule.forRoot({ auth })` in `src/app.module.ts`, configured in
`src/lib/auth/auth.ts`) at the `/api/auth` base path. Two things follow from that:

- **Different response envelope.** These routes are _not_ wrapped by our
  `TransformInterceptor` — no `{ statusCode, message, data }` shell, and errors come
  back as Better Auth's own `{ message, code }` shape, not our `{ property, message }[]`
  validation-error array.
- **Session via cookie, not a bearer token.** Both routes set a
  `better-auth.session_token` cookie via `Set-Cookie` on success. The frontend needs to
  send that cookie on every subsequent request (`credentials: 'include'` in `fetch`, or
  equivalent) — there's no `Authorization: Bearer <token>` header to manage.

### POST /api/auth/sign-up/email

**Body**

```json
{
  "name": "Sub Acc",
  "email": "subaccforuse@gmail.com",
  "password": "Test123456"
}
```

| Field      | Type   | Required | Notes                                                 |
| ---------- | ------ | -------- | ----------------------------------------------------- |
| `name`     | string | yes      |                                                       |
| `email`    | string | yes      |                                                       |
| `password` | string | yes      | non-empty                                             |
| `image`    | string | no       | profile image URL                                     |
| `role`     | enum   | no       | `USER` \| `ADMIN`, default `USER` — see warning below |

**Response** `200`

```json
{
  "token": "the-session-token",
  "user": {
    "id": "...",
    "name": "Sub Acc",
    "email": "subaccforuse@gmail.com",
    "emailVerified": false,
    "image": null,
    "role": "USER",
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

Also sets the `better-auth.session_token` cookie (auto sign-in on success).

**Errors:** `422` if the email is already registered.

**⚠️ `role` is client-settable at sign-up.** `src/lib/auth/auth.ts` configures the
`role` additional field with `input: true`, which means a sign-up request can include
`"role": "ADMIN"` and it's honored directly — self-service admin, no approval step.
This is currently used intentionally for local dev/testing (see the seed commands in
`.claude/settings.local.json`), but it's worth locking down (`input: false`, promote
admins some other way) before this is ever internet-facing.

### POST /api/auth/sign-in/email

**Body**

```json
{
  "email": "rayigo98@gmail.com",
  "password": "Test123456"
}
```

| Field         | Type    | Required | Notes                                                                              |
| ------------- | ------- | -------- | ---------------------------------------------------------------------------------- |
| `email`       | string  | yes      |                                                                                    |
| `password`    | string  | yes      |                                                                                    |
| `callbackURL` | string  | no       | if set, response includes a redirect URL                                           |
| `rememberMe`  | boolean | no       | default `true`; `false` makes the session a browser-session cookie (not persisted) |

**Response** `200`

```json
{
  "redirect": false,
  "token": "the-session-token",
  "user": {
    "id": "...",
    "name": "...",
    "email": "rayigo98@gmail.com",
    "emailVerified": false,
    "image": null,
    "role": "ADMIN",
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

Also sets the `better-auth.session_token` cookie.

**Errors:** `401` invalid email or password.

---

## GET /user/all — **Admin**

List every user. Returns the full `User` record for each row (`id`, `name`, `email`,
`emailVerified`, `image`, `role`, `createdAt`, `updatedAt`) — no field selection, so
don't call this from anywhere other users could see the response.

No query params, no body.

---

## GET /user/search?q=

Typeahead-style lookup, used for building things like an event invite picker.

```
GET /user/search?q=jane
```

| Query param | Type   | Required | Notes                                                       |
| ----------- | ------ | -------- | ----------------------------------------------------------- |
| `q`         | string | yes      | min 1 char after trimming (whitespace-only `q` is rejected) |

Matches `q` against `name` or `email`, case-insensitive (`contains`), excludes the
caller, capped at 10 results. Returns only `id`, `name`, `email`, `image` per user —
deliberately not the full record (no `role`, no `emailVerified`), since this endpoint
is reachable by any authenticated user, not just admins.

**Errors:** `400` if `q` is missing or empty after trimming.

---

## GET /user/:id

Fetch one user by id. Returns the full `User` record, same shape as `GET /user/all`'s
array entries. No ownership check — any authenticated user can look up any other
user's id (but not enumerate all users; that's `GET /user/all`, admin-only).

**Errors:** `404` if no user exists with that id.

---

## Related

`GET /user/search` is what backs the `inviteUserIds` picker documented in
[`src/module/event/API.md`](../event/API.md).
