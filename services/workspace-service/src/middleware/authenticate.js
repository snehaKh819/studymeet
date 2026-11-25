import jwt from 'jsonwebtoken';

export function parseCookies(header = '') {
  return header
    .split(';')
    .map((c) => c.trim())
    .filter(Boolean)
    .reduce((acc, c) => {
      const [name, ...value] = c.split('=');
      acc[name] = decodeURIComponent(value.join('='));
      return acc;
    }, {});
}

// Returns { userId, email, displayName } or null. displayName = the same identity LiveKit uses.
export function userFromToken(token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!payload.userId) return null;
    return { userId: payload.userId, email: payload.email, displayName: payload.username || payload.email };
  } catch {
    return null;
  }
}

export function authenticate(req, res, next) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : parseCookies(req.headers.cookie).token;

  if (!token) return res.status(401).json({ message: 'Authentication required' });
  const user = userFromToken(token);
  if (!user) return res.status(401).json({ message: 'Invalid or expired token' });

  req.token = token;
  req.user = user;
  return next();
}
