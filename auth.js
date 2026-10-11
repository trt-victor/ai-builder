// Who is calling. In Azure, App Service authentication (Entra ID) signs people in before a request reaches this
// process and passes the identity in the X-MS-CLIENT-PRINCIPAL header. That header is only trustworthy behind
// App Service, so it is read only when AUTH=entra. Locally everyone is DEV_USER.
export const ENTRA = process.env.AUTH === 'entra';

export function userFrom(req) {
  if (!ENTRA) {
    const email = (process.env.DEV_USER || 'dev@local').toLowerCase();
    return { email, name: email.split('@')[0] };
  }
  try {
    const p = JSON.parse(Buffer.from(String(req.headers['x-ms-client-principal'] || ''), 'base64').toString('utf8'));
    const claim = (...types) => (p.claims || []).find((c) => types.includes(c.typ))?.val;
    const email = (claim('preferred_username', 'email', 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress') || '').toLowerCase();
    return /^[^@\s]+@[^@\s]+$/.test(email) ? { email, name: claim('name') || email } : null;
  } catch { return null; }
}
