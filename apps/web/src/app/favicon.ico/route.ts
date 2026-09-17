// Some browsers still request the conventional favicon URL directly. Reuse the
// existing generated icon rather than maintaining a second icon asset.
export function GET(request: Request): Response {
    return Response.redirect(new URL('/icon', request.url), 307);
}
