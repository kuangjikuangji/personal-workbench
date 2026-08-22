begin;

select plan(4);

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

select * from finish();

rollback;
