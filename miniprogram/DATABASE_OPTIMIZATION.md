# Database And Admin Security Notes

## Cloud Function Environment Variables

Set these on the `quickstartFunctions` cloud function before using admin mode:

- `KUMA_CLOSET_ADMIN_PASSWORD`: the 8 digit admin password.
- `KUMA_CLOSET_ADMIN_TOKEN_SECRET`: optional token signing secret. If omitted, the admin password is used as the token secret.

The mini program no longer stores the admin password in frontend code. It sends the typed password only to request an admin token. Follow-up admin reads use the token.

Configured for cloud environment `cloud1-d2ghz6vur81165183` on 2026-06-17. Secrets are intentionally not stored in the repository.

## Recommended Database Indexes

The following indexes were created with `tcb db nosql execute` for cloud environment `cloud1-d2ghz6vur81165183` on 2026-06-17:

### `wardrobe_items`

- `wardrobe_sort_id`: `wardrobeId` ascending, `sort_order` ascending, `_id` ascending
- `wardrobe_category_sort_id`: `wardrobeId` ascending, `category` ascending, `sort_order` ascending, `_id` ascending

These support index page loading and category detail loading without `skip`.

### `wardrobe_categories`

- `wardrobe_category_sort`: `wardrobeId` ascending, `sort_order` ascending
- `wardrobe_category_name`: `wardrobeId` ascending, `name` ascending

### `wardrobe_hubs`

- `owner_create_time`: `ownerOpenId` ascending, `createTime` descending
- `shared_create_time`: `sharedOpenIds` ascending, `createTime` descending
- `share_code_enabled`: `shareCode` ascending, `shareEnabled` ascending

## Pagination Strategy

Clothing pagination now uses cursor reads:

- Request `limit + 1` rows.
- Return only `limit` rows.
- Use the last returned item as `{ sortOrder, id }`.
- Query the next page with `sort_order > sortOrder OR (sort_order == sortOrder AND _id > id)`.

This avoids deep `skip` reads on normal item browsing paths.
