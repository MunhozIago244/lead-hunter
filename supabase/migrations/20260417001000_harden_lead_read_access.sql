-- Migration: Harden lead read access
-- Scope: remove public anon read and require authenticated sessions for lead reads

DROP POLICY IF EXISTS "anon_read_leads" ON leads;

CREATE POLICY "authenticated_read_leads"
  ON leads
  FOR SELECT
  TO authenticated
  USING (true);
