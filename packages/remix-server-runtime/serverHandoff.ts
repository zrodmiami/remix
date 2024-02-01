import type { HydrationState } from "@remix-run/router";

import type { FutureConfig } from "./entry";
import { escapeHtml } from "./markup";

type ValidateShape<T, Shape> =
  // If it extends T
  T extends Shape
    ? // and there are no leftover props after removing the base
      Exclude<keyof T, keyof Shape> extends never
      ? // we are good
        T
      : // otherwise it's either too many or too few props
        never
    : never;

// TODO: Remove Promises from serialization
export function createServerHandoffString<T>(serverHandoff: {
  // Don't allow StaticHandlerContext to be passed in verbatim, since then
  // we'd end up including duplicate info
  state: ValidateShape<T, HydrationState>;
  criticalCss?: string;
  url: string;
  future: FutureConfig;
  isSpaMode: boolean;
}): string | undefined {
  if (
    hasRSC(serverHandoff.state.loaderData) ||
    hasRSC(serverHandoff.state.actionData)
  ) {
    return undefined;
  }
  // Uses faster alternative of jsesc to escape data returned from the loaders.
  // This string is inserted directly into the HTML in the `<Scripts>` element.
  return escapeHtml(JSON.stringify(serverHandoff));
}

function hasRSC(routeData: HydrationState["loaderData"] | null | undefined) {
  if (!routeData) return false;
  for (let value of Object.values(routeData)) {
    if (
      value &&
      typeof value === "object" &&
      value.$$typeof === Symbol.for("remix.rsc-data")
    ) {
      return true;
    }
  }
  return false;
}
