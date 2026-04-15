# Enhanced Standalone Lists — Patch 004: Encrypted Lists

**Date:** 2026-03-23
**Applies to:** `frontend_enhanced_lists_ws_contract.md`

Adds server-side flags for client-side encrypted lists. The server stores the encrypted content as-is and never performs encryption or decryption. All crypto is the frontend's responsibility.

---

## 1. New Fields on ListDefinition

**Migration:** `040_list_encrypted.sql` — run `goose up`.

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `is_encrypted` | boolean | `false` | Whether the list content is encrypted |
| `encryption_hint` | string | `""` | Optional password hint for the user |

Both fields are included in all `ListDefinition` payloads (create, edit, fetch, etc.).

---

## 2. Updated Event: `list_edit`

Two new optional fields in the `list_edit` payload:

```json
{
  "event": "list_edit",
  "data": {
    "id": "<uuid>",
    "title": "My Secret List",
    "is_encrypted": true,
    "encryption_hint": "childhood pet",
    "last_modified_at": 1741500000000
  }
}
```

- `is_encrypted` — optional, defaults to current value if omitted
- `encryption_hint` — optional, defaults to current value if omitted

---

## 3. Frontend Encryption Flow

### Encrypting a list

1. User toggles "Encrypt" on a list → frontend prompts for a password
2. Frontend derives an encryption key from the password (recommended: PBKDF2 or Argon2)
3. Frontend encrypts all item `title` and `description` fields client-side
4. Frontend sends `list_edit` with `is_encrypted: true` and optionally `encryption_hint`
5. Frontend sends `list_item_edit` for each item with encrypted `title`/`description`

### Viewing an encrypted list

1. Frontend fetches list, sees `is_encrypted: true`
2. Frontend shows lock icon / "Encrypted" badge — does NOT display item content
3. User clicks to unlock → frontend prompts for password
4. Frontend derives key and decrypts item content locally
5. Content is displayed until the user locks it again or navigates away

### Decrypting a list (removing encryption)

1. User unlocks the list (enters password)
2. Frontend decrypts all items
3. Frontend sends `list_edit` with `is_encrypted: false, encryption_hint: ""`
4. Frontend sends `list_item_edit` for each item with plaintext `title`/`description`

### Password hint

- `encryption_hint` is stored in plaintext on the server
- Displayed to the user when they're prompted for the password
- Should NOT contain the actual password

---

## 4. Important Notes

- **The server never encrypts or decrypts anything.** It stores whatever the frontend sends.
- **If the user forgets the password, the data is unrecoverable.** The server has no way to decrypt it.
- **Shared lists:** If an encrypted list is shared, the other user also needs the password. The password must be communicated out-of-band.
- **Search:** Encrypted item content cannot be searched server-side (it's ciphertext). The `is_encrypted` flag lets the frontend skip search on these lists.
- **`is_encrypted` is a trust flag.** The server doesn't validate that content is actually encrypted — it trusts the frontend.

---

## 5. Fields in List Payloads

The following fields are now included in **every** `ListDefinition` payload returned by the server (via `lists_target`, `list_created`, `list_updated`, `list_deleted_list`, etc.):

| Field | Type | Notes |
|-------|------|-------|
| `is_encrypted` | boolean | `false` for normal lists, `true` for encrypted |
| `encryption_hint` | string | `""` if no hint set |
| `deleted_at` | timestamp \| null | `null` for active lists, timestamp for soft-deleted |

**Critical:** The frontend MUST check `is_encrypted` before encrypting content. If `is_encrypted` is already `true`, do NOT encrypt again — the content is already ciphertext. Double-encryption makes the data unrecoverable.

---

## Summary

| # | Change | Frontend Action Required |
|---|--------|------------------------|
| 1 | `is_encrypted` + `encryption_hint` fields in all list payloads | Yes — add to ListDefinition model |
| 2 | `list_edit` accepts new fields | Yes — implement encrypt/decrypt toggle UI |
| 3 | Client-side encryption | Yes — implement key derivation + AES encryption |
| 4 | Password prompt on encrypted lists | Yes — prompt before displaying content |
| 5 | Check `is_encrypted` before encrypting | Yes — prevent double-encryption |
