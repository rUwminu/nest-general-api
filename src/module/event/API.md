# Event API

All routes are under `/event` and require authentication (global `AuthGuard`), unless
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
      "property": "name",
      "message": "name must be longer than or equal to 3 characters"
    }
  ]
}
```

---

## POST /event

Create an event. `authorId` is taken from the session — never send it in the body.

**Body**

```json
{
  "name": "Team Offsite",
  "description": "Quarterly planning day, min 10 chars, max 1000",
  "startsAt": "2026-08-01T09:00:00.000Z",
  "endsAt": "2026-08-01T17:00:00.000Z",
  "isActive": true,
  "joinPolicy": "OPEN",
  "inviteUserIds": ["userId1", "userId2"]
}
```

| Field           | Type     | Required | Notes                                                                                    |
| --------------- | -------- | -------- | ---------------------------------------------------------------------------------------- |
| `name`          | string   | yes      | min 3 chars                                                                              |
| `description`   | string   | yes      | min 10, max 1000 chars                                                                   |
| `startsAt`      | ISO date | yes      | must be ≥ 5 minutes from now                                                             |
| `endsAt`        | ISO date | yes      | must be ≥ 5 minutes from now                                                             |
| `isActive`      | boolean  | no       | default `true`; manual pause switch, not the time-based closure                          |
| `joinPolicy`    | enum     | no       | `OPEN` \| `INVITE_ONLY`, default `OPEN`                                                  |
| `inviteUserIds` | string[] | no       | deduped, self excluded automatically; **required (≥1)** if `joinPolicy` is `INVITE_ONLY` |

**Errors:** `400` if invite-only with no invitees, or any `inviteUserIds` doesn't match a real user.

---

## GET /event

List events visible to the caller.

**Visibility:** admins see everything (except soft-deleted); everyone else sees non-banned events, OR their own events, OR events they're a participant in.

No query params, no body.

---

## GET /event/:id

Get one event's detail, including `participants` (always) and `invites` (**owner/admin only** — omitted entirely for everyone else).

**Errors:** `404` if the event doesn't exist, is soft-deleted, or is hidden from the caller by the visibility rule (banned events 404 rather than 403, so their existence isn't leaked).

---

## PATCH /event/:id

Update an event. **Owner only.**

**Body** — same shape as `POST /event`, all fields optional (partial update). Omitted fields are left untouched.

```json
{
  "name": "Updated name",
  "description": "Some desc",
  "isActive": false,
  "joinPolicy": "INVITE_ONLY",
  "inviteUserIds": ["userId1", "userId2"]
}
```

`inviteUserIds`, if present, **replaces** the event's invite list the same way `PUT /event/:id/invites` does (diffed: missing users removed, new users added, unchanged users keep their `PENDING`/`ACCEPTED`/`DECLINED` status). Omit the field entirely to leave existing invites untouched. `PUT /event/:id/invites` still exists as a lighter-weight alternative when you only need to change invites without resending the rest of the event.

**Errors:** `403` if the caller isn't the event's author. `404` if not found/deleted. `400` if `inviteUserIds` contains an unknown userId, or if the resulting `joinPolicy` is `INVITE_ONLY` with zero invitees (whether that's because `inviteUserIds` was sent empty, or because `joinPolicy` was switched to `INVITE_ONLY` on an event that currently has no invites).

---

## DELETE /event/:id

Soft-delete an event (`isDeleted: true`, `deletedAt` set). **Owner only.** No body.

**Errors:** `403` if not the author. `404` if not found or already deleted.

---

## PUT /event/:id/invites

Replace the event's invite list. **Owner only.** Send the **full desired list** — the
server diffs it against the current invites: missing users are removed, new users are
added, unchanged users (and their `PENDING`/`ACCEPTED`/`DECLINED` status) are left alone.

**Body**

```json
{
  "userIds": ["userId1", "userId2", "userId3"]
}
```

**Errors:** `403` if not the owner. `400` if any userId doesn't exist, or if the event is `INVITE_ONLY` and the resulting list would be empty.

---

## PATCH /event/:id/invite/respond

Accept or decline an invite. Only works for a user who actually has an invite row for
this event.

**Body**

```json
{
  "status": "ACCEPTED"
}
```

`status` must be `"ACCEPTED"` or `"DECLINED"` (not `"PENDING"`).

- `ACCEPTED` → also creates the caller's `EventParticipant` row (idempotent).
- `DECLINED` → only updates the invite row; doesn't remove any existing participation.

**Errors:** `404` if the caller has no invite for this event. `400` if the event is banned or `endsAt` has already passed ("Event has already closed").

---

## POST /event/:id/join

Join an event directly (no body).

- If already a participant → no-op, returns success.
- `OPEN` events → joins immediately.
- `INVITE_ONLY` events → requires an existing `EventInvite` row for the caller, **in any status** (a prior decline doesn't lock you out — you can still join later).

**Errors:** `403` if `INVITE_ONLY` and the caller was never invited. `400` if the event is banned or already closed (`now() > endsAt`).

---

## POST /event/:id/ban — **Admin**

Ban an event, hiding it from everyone except the owner, admins, and existing participants.

**Body**

```json
{
  "reason": "Violates community guidelines"
}
```

`reason` required, min 3 chars. Writes a row to `EventBanLog` (`action: BANNED`) and sets `Event.isBanned = true`.

**Errors:** `400` if the event is already banned.

---

## POST /event/:id/unban — **Admin**

**Body**

```json
{
  "reason": "Appeal accepted"
}
```

`reason` optional, min 3 chars if provided. Writes a row to `EventBanLog` (`action: UNBANNED`) and sets `Event.isBanned = false`.

**Errors:** `400` if the event isn't currently banned.

---

## Related: GET /user/search?q=

Not in this module, but used for building the `inviteUserIds` picker on the frontend.
Lives at `src/module/user/user.controller.ts`.

```
GET /user/search?q=jane
```

| Query param | Type   | Required | Notes                     |
| ----------- | ------ | -------- | ------------------------- |
| `q`         | string | yes      | min 1 char after trimming |

Returns up to 10 users (`id`, `name`, `email`, `image` only) matching `q` against name or email, case-insensitive, excluding the caller.
