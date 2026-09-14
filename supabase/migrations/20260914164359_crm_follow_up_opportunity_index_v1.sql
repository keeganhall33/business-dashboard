create index if not exists crm_follow_ups_v1_opportunity_idx
  on public.crm_follow_ups_v1(opportunity_id)
  where opportunity_id is not null;
