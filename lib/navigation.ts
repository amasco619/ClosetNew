type DismissableRouter = {
  canDismiss(): boolean;
  dismissAll(): void;
};

/** A one-route stack cannot handle POP_TO_TOP; callers should still replace their destination. */
export function dismissAllIfPossible(router: DismissableRouter): boolean {
  if (!router.canDismiss()) return false;
  router.dismissAll();
  return true;
}
