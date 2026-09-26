-- Product decision: normal owner-authorized features no longer use skill unlocks.
-- Apply after deploying code without skill-table dependencies. RESTRICT is
-- intentional: unexpected dependencies must stop the migration, not be deleted.
DROP TABLE IF EXISTS public.store_skill_states RESTRICT;
