// Next may normalize request.url to its listener hostname. Compare browser
// Origin with the incoming Host so same-origin forms work behind the hosting
// proxy and on a loopback listener, while cross-site mutations are rejected.
export function requestOrigin(request: Request) {
    const url = new URL(request.url);
    const host = request.headers.get('host') || url.host;
    const forwarded = request.headers.get('x-forwarded-proto');
    const protocol = forwarded === 'https' || forwarded === 'http' ? `${forwarded}:` : url.protocol;
    return new URL(`${protocol}//${host}`).origin;
}
export function sameOrigin(request: Request) {
    const origin = request.headers.get('origin');
    if (!origin) return true;
    try {
        const supplied = new URL(origin);
        return supplied.origin === origin && supplied.origin === requestOrigin(request);
    } catch { return false; }
}
