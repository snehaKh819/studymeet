import jwt from 'jsonwebtoken';

function parseCookies(req) {
  return (req.headers.cookie || '')
    .split(';')
    .map((c) => c.trim())
    .filter(Boolean)
    .reduce((acc, c) => {
      const [name, ...value] = c.split('=');
      acc[name] = decodeURIComponent(value.join('='));
      return acc;
    }, {});
}

export function authenticate(req, res, next) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : parseCookies(req).token;

  if (!token) return res.status(401).json({ message: 'Authentication required' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!payload.userId) throw new Error('missing userId');
    req.token = token;
    req.user = {
      userId: payload.userId,
      email: payload.email,
      displayName: payload.username || payload.email, // same identity LiveKit uses
    };
    return next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}
