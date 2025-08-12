const jwt = require('jsonwebtoken');

const JWT_SECRETS = [
  process.env.JWT_SECRET,
  process.env.JWT_SECRET_OLD        // optional
].filter(Boolean);

// Grace-period validation
const GRACE_DAYS = parseInt(process.env.JWT_SECRET_GRACE_DAYS || '0', 10);

/* ---------- signing ---------- */
exports.sign = (payload, opts = {}) =>
  jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: '24h',
    issuer:   'kiron-timespring-api',
    audience: 'kiron-devices',
    ...opts
  });

/* ---------- verification w/ rotation ---------- */
exports.verify = (token) => {
  let decoded, secretUsed;
  for (const secret of JWT_SECRETS) {
    try {
      decoded = jwt.verify(token, secret);
      secretUsed = secret;
      break;
    } catch (_) { /* try next */ }
  }
  if (!decoded) throw new Error('INVALID_TOKEN');

  // If old secret was used & grace period passed -> reject
  if (
    secretUsed !== process.env.JWT_SECRET &&
    GRACE_DAYS &&
    Date.now() - decoded.iat * 1000 > GRACE_DAYS * 86_400_000
  ) {
    throw new Error('TOKEN_NEEDS_REFRESH');
  }
  return decoded;
};