begin;

select plan(10);

delete from auth.users
where id in (
  '00000000-0000-4000-8000-000000000050',
  '00000000-0000-4000-8000-000000000051',
  '00000000-0000-4000-8000-000000000052'
);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000050',
    'authenticated', 'authenticated',
    'admin-rpc-a@users.workbench.invalid',
    extensions.crypt('password-admin-a', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000051',
    'authenticated', 'authenticated',
    'admin-rpc-b@users.workbench.invalid',
    extensions.crypt('password-admin-b', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000052',
    'authenticated', 'authenticated',
    'member-rpc@users.workbench.invalid',
    extensions.crypt('password-member', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now()
  );

insert into public.profiles (id, username, role, is_active, must_change_password)
values
  ('00000000-0000-4000-8000-000000000050', 'admin-rpc-a', 'admin', true, false),
  ('00000000-0000-4000-8000-000000000051', 'admin-rpc-b', 'admin', true, false),
  ('00000000-0000-4000-8000-000000000052', 'member-rpc', 'member', true, false);

select throws_ok(
  $$ select public.admin_deactivate_profile(
       '00000000-0000-4000-8000-000000000052',
       '00000000-0000-4000-8000-000000000051'
     ) $$,
  '42501',
  'admin_required',
  'a member actor cannot deactivate an account'
);

update public.profiles
set is_active = false
where id = '00000000-0000-4000-8000-000000000050';
select throws_ok(
  $$ select public.admin_deactivate_profile(
       '00000000-0000-4000-8000-000000000050',
       '00000000-0000-4000-8000-000000000051'
     ) $$,
  '42501',
  'account_inactive',
  'an inactive administrator actor cannot deactivate an account'
);

update public.profiles
set is_active = true, must_change_password = true
where id = '00000000-0000-4000-8000-000000000050';
select throws_ok(
  $$ select public.admin_deactivate_profile(
       '00000000-0000-4000-8000-000000000050',
       '00000000-0000-4000-8000-000000000051'
     ) $$,
  '42501',
  'password_change_required',
  'an administrator awaiting password change cannot deactivate an account'
);

update public.profiles
set must_change_password = false
where id = '00000000-0000-4000-8000-000000000050';
select throws_ok(
  $$ select public.admin_deactivate_profile(
       '00000000-0000-4000-8000-000000000050',
       '00000000-0000-4000-8000-000000000050'
     ) $$,
  '22023',
  'self_deactivation',
  'an administrator cannot deactivate self'
);

select throws_ok(
  $$ select public.admin_deactivate_profile(
       '00000000-0000-4000-8000-000000000050',
       '00000000-0000-4000-8000-000000000059'
     ) $$,
  'P0002',
  'account_not_found',
  'a missing target is rejected'
);

select lives_ok(
  $$ select public.admin_deactivate_profile(
       '00000000-0000-4000-8000-000000000050',
       '00000000-0000-4000-8000-000000000052'
     ) $$,
  'an active completed administrator can deactivate a member'
);
select is(
  (select is_active from public.profiles where id = '00000000-0000-4000-8000-000000000052'),
  false,
  'member target becomes inactive'
);

select lives_ok(
  $$ select public.admin_deactivate_profile(
       '00000000-0000-4000-8000-000000000050',
       '00000000-0000-4000-8000-000000000051'
     ) $$,
  'one of two active administrators can be deactivated'
);
select is(
  (select is_active from public.profiles where id = '00000000-0000-4000-8000-000000000051'),
  false,
  'administrator target becomes inactive'
);
select is(
  (select count(*) from public.profiles where role = 'admin' and is_active),
  1::bigint,
  'successful administrator deactivation leaves one active administrator'
);

select * from finish();

rollback;
