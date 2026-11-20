begin;
-- Future onboarding uses 30 days. Existing grants retain their agreed expiry.
alter table public.platform_trial_settings alter column days set default 30;
update public.platform_trial_settings set days=30,revision=revision+1,updated_at=now()
 where singleton and days<>30;
notify pgrst,'reload schema';
commit;
