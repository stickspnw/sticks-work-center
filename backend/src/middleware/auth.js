import jwt from "jsonwebtoken";

export function requireAuth(req, res, next) {
  const token = (req.headers.authorization || "").replace("Bearer ", "").trim();
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || "dev-secret");
    req.user = payload;
    return next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

export function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Missing auth" });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: "Forbidden" });
    next();
  };
}
