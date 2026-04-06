import { useSyncExternalStore } from "react";

function subscribe(cb: () => void) {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}

function getSnapshot() {
  return document.documentElement.getAttribute("data-theme") === "light";
}

/** Reactive hook that returns `true` when the app uses the light theme. */
export function useIsLightTheme() {
  return useSyncExternalStore(subscribe, getSnapshot);
}
