-- Franchise enquiries from herbalholland.com/franchise (the Worker checks them with src/lib/leads.ts first).
CREATE TABLE enquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  area TEXT NOT NULL,
  province TEXT NOT NULL,
  experience TEXT NOT NULL,
  capital TEXT NOT NULL,
  pharmacist INTEGER NOT NULL,
  message TEXT,
  source TEXT,
  ip_hash TEXT, -- keyed hash of the IP, only to limit repeat submissions
  notified_at TEXT, -- emailed to the team
  forwarded_at TEXT, -- handed to HQ → Franchise leads
  app_number TEXT -- its FL number there
);
CREATE INDEX enquiries_ip ON enquiries (ip_hash, created_at);
CREATE INDEX enquiries_email ON enquiries (email, created_at);
