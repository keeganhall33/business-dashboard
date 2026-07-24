-- Phase A hardening: ensure set_updated_at exists and enable Prepared Actions RLS.

-- Ensure the trigger helper exists (safe no-op if already defined).
do $$
begin
  if not exists (
    select 1
    from pg_proc
    where proname = 'set_updated_at'
  ) then
    execute $$
      create function public.set_updated_at()
      returns trigger
      language plpgsql
      as $$
      begin
        new.updated_at = timezone('utc', now());
        return new;
      end;
      $$;
    $$;
  end if;
end $$;

-- Lock down prepared_actions so only service-role / backend access is allowed.
alter table if exists prepared_actions enable row level security;

-- (Optional) future policies for read-only roles can be added here once defined.
