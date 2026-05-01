// Helper used by routes that record an "initials" stamp on audit/history
// entries. The frontend no longer prompts the user for initials, so we derive
// them from the logged-in user when the request doesn't include them.

export function deriveInitialsFromUser(user) {
  const dn = String(user?.displayName || "").trim();
  const un = String(user?.username || "").trim();

  // Prefer displayName: take initials of first + last word.
  if (dn) {
    const parts = dn.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const ini = (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      if (/^[A-Z]{2}$/.test(ini)) return ini;
    }
    const letters = dn.replace(/[^A-Za-z]/g, "").toUpperCase();
    if (letters.length >= 2) return letters.slice(0, 3);
  }

  // Fallback to username (strip non-letters, take first 2-3 letters).
  if (un) {
    const letters = un.replace(/[^A-Za-z]/g, "").toUpperCase();
    if (letters.length >= 2) return letters.slice(0, 3);
  }

  return "USR";
}

// Resolve the initials to record for the request. If a valid value was sent in
// the body we use it; otherwise we derive one from `req.user` so callers never
// have to bother prompting end users.
export function resolveInitials(req) {
  const raw = String(req.body?.initials || "").trim().toUpperCase();
  if (/^[A-Z]{2,3}$/.test(raw)) return raw;
  return deriveInitialsFromUser(req.user);
}
