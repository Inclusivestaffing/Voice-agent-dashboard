-- One access level: everyone in a workspace is an Admin.
-- The workspace creator stays 'owner' internally so they can't be removed; the app shows them as Admin.
update public.workspace_members set role = 'admin' where role in ('user', 'client');
update public.workspace_invites set role = 'admin' where role in ('user', 'client');
alter table public.workspace_members alter column role set default 'admin';
alter table public.workspace_invites alter column role set default 'admin';
