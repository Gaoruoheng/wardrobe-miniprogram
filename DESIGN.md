# Wardrobe Mini Program Design System

## Theme identity

The product has two user-selectable skins:

- `甜蜜小窝`: warm cream, coral, mint, and character stickers.
- `月宫衣阁`: moonlight purple, muted gold, clouds, mooncake selection controls, and the rabbit add control.

The stored ID `princess-castle` remains unchanged for compatibility. It is an implementation identifier, not user-facing copy.

## Language rule

Themes may change atmosphere and supporting copy. Core operations keep literal labels such as `新增衣物`, `选择照片`, `衣物信息`, `选择分类`, and `保存到衣柜` so changing a skin never changes the user's mental model.

## Shared visual roles

All pages and isolated components use the roles from `miniprogram/styles/theme-tokens.wxss`:

- `--skin-bg`: page background.
- `--skin-surface` and `--skin-surface-soft`: primary and secondary surfaces.
- `--skin-ink` and `--skin-muted`: readable primary and supporting text.
- `--skin-accent` and `--skin-accent-soft`: selection and primary actions.
- `--skin-gold`: the moon theme's secondary accent.
- `--skin-border` and `--skin-shadow`: restrained separation.
- `--skin-decoration-opacity`: decorative intensity.

## Signature decoration

The moon skin keeps three signature moments: the moon-palace hero, the mooncake clothing selector, and the rabbit add control. Routine list, search, plan, and outfit surfaces stay quieter so clothing remains the primary content.

## Accessibility

- Normal text targets at least 4.5:1 contrast.
- Primary touch targets use at least 88rpx hit areas while visual faces may remain smaller.
- Continuous decorative motion must provide a reduced-motion fallback.
