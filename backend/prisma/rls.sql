-- Prisma connects as the database owner and continues to use these tables.
-- Supabase anon/authenticated clients must use the Express API instead.
ALTER TABLE public."Organization" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."DealerGroup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Store" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Customer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Task" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."FollowUp" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CustomerTransaction" ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public."Organization" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."User" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."DealerGroup" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."Store" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."Customer" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."Task" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."FollowUp" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."Order" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."Payment" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."CustomerTransaction" FROM anon, authenticated;
