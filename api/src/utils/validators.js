// Indian mobile numbers are exactly 10 digits.
export const MOBILE_RE = /^\d{10}$/;

export function isValidMobile(m) {
  return typeof m === 'string' && MOBILE_RE.test(m.trim());
}
