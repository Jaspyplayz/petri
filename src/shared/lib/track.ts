export const EVENTS_ENDPOINT = "/api/events";

export type TrackedEvent = {
  readonly featureId: string;
  readonly action: string;
  readonly path: string;
};

export function track(featureId: string, action: string): void {
  if (typeof window === "undefined") return;
  const event: TrackedEvent = { featureId, action, path: window.location.pathname };
  const body = JSON.stringify(event);
  const sent = navigator.sendBeacon(EVENTS_ENDPOINT, new Blob([body], { type: "application/json" }));
  if (!sent) {
    void fetch(EVENTS_ENDPOINT, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
      keepalive: true,
    }).catch(() => undefined);
  }
}
