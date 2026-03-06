# Settings: Floating Save Configuration bar

## Summary

The Settings page action buttons (Save Configuration, Clear All) are now shown in a **floating bar** fixed at the bottom center of the viewport, so they stay visible while scrolling through long configuration forms.

## Changes

- **Floating bar**: Fixed at `bottom-6`, centered horizontally (`left-1/2 -translate-x-1/2`), with `z-50`, pill-shaped container (`rounded-full`), semi-transparent card background and backdrop blur.
- **Spacer**: Added bottom spacer (`h-20`) in the main content so the "Get API Keys" links are not covered by the floating bar.
- Buttons use `rounded-full` to match the bar; Save remains primary, Clear remains secondary.

## Files

- `apps/web/app/(example)/example/settings/page.tsx`
