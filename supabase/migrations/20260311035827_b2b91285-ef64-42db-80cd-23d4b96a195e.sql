
-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Anyone authenticated can insert contracts" ON public.contracts;
DROP POLICY IF EXISTS "Anyone authenticated can read contracts" ON public.contracts;
DROP POLICY IF EXISTS "Anyone authenticated can update contracts" ON public.contracts;

-- Create permissive policies for anon role (app uses its own auth, not Supabase auth)
CREATE POLICY "Allow all select on contracts" ON public.contracts FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow all insert on contracts" ON public.contracts FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow all update on contracts" ON public.contracts FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
