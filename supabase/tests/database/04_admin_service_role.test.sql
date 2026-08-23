begin;

select plan(8);

select ok(
  has_table_privilege('service_role', 'public.profiles', 'select'),
  'service role can list account profiles after policy authorization'
);
select ok(
  has_table_privilege('service_role', 'public.profiles', 'insert'),
  'service role can seed and create account profiles'
);
select ok(
  has_table_privilege('service_role', 'public.profiles', 'update'),
  'service role can activate, deactivate, and mark password state'
);
select is(
  has_table_privilege('service_role', 'public.profiles', 'delete'),
  false,
  'service role cannot directly delete account profiles'
);
select has_function(
  'public',
  'admin_deactivate_profile',
  array['uuid', 'uuid'],
  'transactional administrator deactivation RPC exists'
);
select ok(
  exists (
    select 1
    from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name = 'admin_deactivate_profile'
      and grantee = 'service_role'
      and privilege_type = 'EXECUTE'
  ),
  'service role can execute the deactivation RPC'
);
select ok(
  not exists (
    select 1
    from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name = 'admin_deactivate_profile'
      and grantee in ('PUBLIC', 'anon')
      and privilege_type = 'EXECUTE'
  ),
  'public and anon cannot execute the deactivation RPC'
);
select ok(
  not exists (
    select 1
    from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name = 'admin_deactivate_profile'
      and grantee = 'authenticated'
      and privilege_type = 'EXECUTE'
  ),
  'authenticated users cannot execute the deactivation RPC'
);

select * from finish();

rollback;
