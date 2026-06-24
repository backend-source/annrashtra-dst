-- v6: human-readable promoter/employee code.
-- Every user already has a system UUID (id) and a unique mobile. This adds an
-- optional short code the admin assigns (e.g. KHF-001) for ID cards, registers
-- and matching the company's HR/employee numbers. Unique when present; NULL is
-- allowed (partial unique) so existing rows and non-promoters need no code.
ALTER TABLE users ADD COLUMN IF NOT EXISTS emp_code text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_emp_code ON users(emp_code) WHERE emp_code IS NOT NULL;
