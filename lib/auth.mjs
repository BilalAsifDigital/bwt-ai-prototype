// Shared passcode gate for all API functions.
// Set PROTO_PASSCODE in Netlify env; clients send it as the X-Passcode header.
// With no PROTO_PASSCODE configured the API is open (local dev convenience).

export function isAuthorized(req) {
  const pass = process.env.PROTO_PASSCODE;
  if (!pass) return true;
  return req.headers.get("x-passcode") === pass;
}

export function unauthorized() {
  return Response.json({ error: "invalid or missing passcode" }, { status: 401 });
}

export function json(body, status = 200) {
  return Response.json(body, { status });
}
