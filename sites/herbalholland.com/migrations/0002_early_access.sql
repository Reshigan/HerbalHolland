-- The early-access list from herbalholland.com (the Worker checks sign-ups with validateEarlyAccess in src/lib/leads.ts).
-- Kept until the shop opens and 12 months at most (worker.ts scheduled); one row per email and per mobile number.
CREATE TABLE early_access (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  first_name TEXT,
  email TEXT,
  mobile TEXT, -- E.164 (+27…)
  province TEXT,
  source TEXT,
  consent TEXT NOT NULL, -- the consent wording ticked (EARLY_ACCESS_CONSENT)
  ip_hash TEXT -- keyed hash of the IP, only to limit repeat sign-ups
);
CREATE UNIQUE INDEX early_access_email ON early_access (email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX early_access_mobile ON early_access (mobile) WHERE mobile IS NOT NULL;
CREATE INDEX early_access_ip ON early_access (ip_hash, created_at);
