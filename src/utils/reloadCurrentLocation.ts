import type { AnyRouter } from "@tanstack/react-router";

export function reloadCurrentLocation(router: AnyRouter): Promise<void> {
  return router.navigate({ href: router.state.location.href, replace: true });
}
