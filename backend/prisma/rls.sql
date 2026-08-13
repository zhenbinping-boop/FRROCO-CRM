-- RLS is a database safety boundary for Supabase authenticated clients and
-- trusted Express transactions using SET LOCAL app.user_id = '<User.id>'.
-- The Express runtime role must not own these tables and must not BYPASSRLS.

CREATE SCHEMA IF NOT EXISTS app_private;

CREATE OR REPLACE FUNCTION app_private.current_crm_user_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('app.user_id', true), ''),
    (SELECT u.id::text FROM public."User" u WHERE u."supabaseAuthId" = (SELECT auth.uid()) LIMIT 1)
  )
$$;

CREATE OR REPLACE FUNCTION app_private.current_data_scope()
RETURNS "DataScope"
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT r."dataScope"
  FROM public."User" u
  JOIN public."Role" r ON r.id = u."roleId"
  WHERE u.id = app_private.current_crm_user_id() AND u.active AND r.active
$$;

CREATE OR REPLACE FUNCTION app_private.current_organization_ids()
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH RECURSIVE tree AS (
    SELECT o.id, o."parentId"
    FROM public."Organization" o
    JOIN public."User" u ON u."organizationId" = o.id
    WHERE u.id = app_private.current_crm_user_id()
    UNION ALL
    SELECT child.id, child."parentId"
    FROM public."Organization" child
    JOIN tree parent ON child."parentId" = parent.id
    WHERE app_private.current_data_scope() = 'SUB_DEPARTMENT'
  )
  SELECT id FROM tree
$$;

CREATE OR REPLACE FUNCTION app_private.can_access_customer(customer_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE app_private.current_data_scope()
    WHEN 'ALL' THEN true
    WHEN 'SELF' THEN EXISTS (
      SELECT 1 FROM public."Customer" c
      WHERE c.id = customer_id
        AND (c."salesRepId" = app_private.current_crm_user_id() OR c."designerId" = app_private.current_crm_user_id())
    )
    ELSE EXISTS (
      SELECT 1 FROM public."Customer" c
      JOIN public."Store" s ON s.id = c."storeId"
      WHERE c.id = customer_id AND s."organizationId" IN (SELECT app_private.current_organization_ids())
    )
  END
$$;

ALTER FUNCTION app_private.current_crm_user_id() OWNER TO postgres;
ALTER FUNCTION app_private.current_data_scope() OWNER TO postgres;
ALTER FUNCTION app_private.current_organization_ids() OWNER TO postgres;
ALTER FUNCTION app_private.can_access_customer(text) OWNER TO postgres;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app_private FROM PUBLIC, anon, authenticated;

DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['Organization','Position','User','Role','Permission','RolePermission','DealerGroup','Store','Customer','Task','FollowUp','Order','Payment','CustomerTransaction'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon, authenticated', table_name);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public."Organization", public."Position", public."User", public."Role", public."Permission", public."RolePermission",
  public."DealerGroup", public."Store", public."Customer", public."Task", public."FollowUp", public."Order", public."Payment", public."CustomerTransaction"
TO authenticated;

CREATE POLICY crm_user_visible ON public."User" FOR SELECT TO authenticated
USING (id = app_private.current_crm_user_id() OR app_private.current_data_scope() IN ('ALL', 'SUB_DEPARTMENT'));
CREATE POLICY crm_organization_visible ON public."Organization" FOR SELECT TO authenticated
USING (id IN (SELECT app_private.current_organization_ids()) OR app_private.current_data_scope() = 'ALL');
CREATE POLICY crm_role_visible ON public."Role" FOR SELECT TO authenticated
USING (active OR app_private.current_data_scope() = 'ALL');
CREATE POLICY crm_permission_visible ON public."Permission" FOR SELECT TO authenticated
USING (true);
CREATE POLICY crm_role_permission_visible ON public."RolePermission" FOR SELECT TO authenticated
USING (true);
CREATE POLICY crm_position_visible ON public."Position" FOR SELECT TO authenticated
USING (true);

CREATE POLICY crm_store_visible ON public."Store" FOR SELECT TO authenticated
USING ("organizationId" IN (SELECT app_private.current_organization_ids()) OR app_private.current_data_scope() = 'ALL');
CREATE POLICY crm_dealer_group_visible ON public."DealerGroup" FOR SELECT TO authenticated
USING ("organizationId" IN (SELECT app_private.current_organization_ids()) OR app_private.current_data_scope() = 'ALL');
CREATE POLICY crm_customer_visible ON public."Customer" FOR SELECT TO authenticated
USING (app_private.can_access_customer(id));
CREATE POLICY crm_task_visible ON public."Task" FOR SELECT TO authenticated
USING (app_private.can_access_customer("customerId") OR "assigneeId" = app_private.current_crm_user_id());
CREATE POLICY crm_follow_up_visible ON public."FollowUp" FOR SELECT TO authenticated
USING (app_private.can_access_customer("customerId") OR "authorId" = app_private.current_crm_user_id());
CREATE POLICY crm_order_visible ON public."Order" FOR SELECT TO authenticated
USING (app_private.can_access_customer("customerId"));
CREATE POLICY crm_payment_visible ON public."Payment" FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public."Order" o WHERE o.id = "orderId" AND app_private.can_access_customer(o."customerId")));
CREATE POLICY crm_transaction_visible ON public."CustomerTransaction" FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public."Customer" c WHERE c.id = "customerId" AND app_private.can_access_customer(c.id)));

-- Writes are deliberately not opened to direct Supabase clients. Express
-- remains the write API and should execute writes in an app.user_id context.
