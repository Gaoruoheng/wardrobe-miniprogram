# Header Share and Default Add Button Polish

## Scope

Refine two controls on the wardrobe page without changing their position, event handlers, permissions, or surrounding layout:

- The WeChat-native share button in the wardrobe header.
- The default `甜蜜小窝` skin's add-clothing floating action.

The `月宫衣阁` rabbit add control remains unchanged.

## Share control

The native `button` remains in WXML because `open-type="share"` depends on it. Its outer layer becomes a fully transparent 88rpx interaction target with no border, shadow, background, overflow clipping, or active transform. The inner `invite-text` capsule remains the visible face and uses the same height, type weight, and optical alignment as the adjacent settings capsule.

This separation prevents global button styling from producing the black right-and-bottom frame seen in the supplied screenshot.

## Default add-clothing control

The default skin changes from an unlabeled circular plus to a compact cream-and-pink pill:

- A coral circular plus badge on the left.
- The literal label `新增衣物` on the right.
- A soft brown outline and restrained pink shadow consistent with `甜蜜小窝`.
- A pressed state that moves the visual face, not the fixed hit target.

The control remains fixed in the existing bottom-right position, keeps safe list clearance through the existing `fab-lift` state, and retains at least an 88rpx touch target.

## Compatibility and verification

- No JavaScript or navigation changes.
- Existing `bindtap="goAdd"` and `open-type="share"` remain intact.
- Moon-skin rabbit markup and styles remain intact.
- Automated markup/style tests cover the native button reset and the default add-button structure.
- Existing wardrobe, outfit, plan, and theme regression tests must continue to pass.
