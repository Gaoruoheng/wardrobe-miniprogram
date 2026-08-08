# Unified Planning Design

## Objective

Replace the duplicate “计划” and “任务” tabs with one “计划” tab. It remains a lightweight checklist and keeps the existing 拿衣清单 card above the list.

## User experience

- Navigation becomes `菜单 → 套装 → 计划 → 关于`.
- The 计划 tab contains, in order: heading and add button, the existing 拿衣清单 card when clothes are selected, add-plan input, and the checklist.
- The existing plan item controls and their enlarged hit areas remain unchanged.
- Empty state is shown only when there are neither selected clothes nor plan items.

## Data migration

- `plans` is the sole checklist field going forward.
- On reading a wardrobe, existing `plans` and legacy `tasks` are concatenated in their original order, retaining every item and its done state.
- The migrated record is immediately saved with the merged `plans` and `tasks: []`, so later refreshes cannot duplicate legacy tasks.
- Missing or duplicated legacy IDs are made unique for WXML keys without changing item text or done state.

## Compatibility and non-goals

- The selected-clothes data (`selectedItemIds`) and its existing panel behavior are unchanged.
- No collection, cloud function, clothing status, outfit, or authorization behavior changes.
- The old `tasks` field is retained as an empty compatibility field after migration rather than deleted.
