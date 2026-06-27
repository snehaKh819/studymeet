import jwt from 'jsonwebtoken';

function parseCookies(req) {
  const cookieHeader = req.headers.cookie || '';
  return cookieHeader
    .split(';')
    .map(cookie => cookie.trim())
    .filter(Boolean)
    .reduce((cookies, cookie) => {
      const [name, ...value] = cookie.split('=');
      cookies[name] = decodeURIComponent(value.join('='));
      return cookies;
    }, {});
}

export const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  let token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;

  if (!token) {
    const cookies = parseCookies(req);
    token = cookies.token;
  }

  if (!token) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};
