export type GuardFailure = { readonly status: 403 | 415; readonly error: "cross_site" | "unsupported_media_type" };

const ALLOWED_FETCH_SITES = new Set(["same-origin", "none"]);

export function crossSiteFailure(request: Request): GuardFailure | null {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite !== null && !ALLOWED_FETCH_SITES.has(fetchSite)) {
    return { status: 403, error: "cross_site" };
  }
  const origin = request.headers.get("origin");
  if (origin !== null) {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    let originHost: string | null = null;
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = null;
    }
    if (originHost === null || originHost !== host) return { status: 403, error: "cross_site" };
  }
  return null;
}

export function jsonContentTypeFailure(request: Request): GuardFailure | null {
  const contentType = request.headers.get("content-type") ?? "";
  return contentType.split(";")[0]?.trim().toLowerCase() === "application/json"
    ? null
    : { status: 415, error: "unsupported_media_type" };
}

export function guardJsonWrite(request: Request): GuardFailure | null {
  return crossSiteFailure(request) ?? jsonContentTypeFailure(request);
}
