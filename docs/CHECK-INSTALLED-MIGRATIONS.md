# Check the installed database upgrades

Open the Supabase project used by Countiva. In SQL Editor, paste and run the full contents of `supabase/check-installed-migrations.sql`. It only reads PostgreSQL schema metadata; it does not apply migrations, change users, create a trial, send email or charge a payment.

The output has ten rows, covering migrations 001–010.

- **PRESENT (structural check)**: all listed tables, columns and function signatures exist. Do not rerun that migration merely to test it.
- **NOT DETECTED**: none of the listed markers exist. Check earlier migrations and confirm the correct project before installing it.
- **PARTIAL - REVIEW BEFORE RUNNING SQL**: some markers exist but others are missing. Share this row and its `missing_objects` list before attempting a repair.

The report includes the exact function signature needed by the admin subscription screen and the enabled trigger needed for trial notifications. Function signatures are checked in PostgreSQL directly; a stale PostgREST cache can still prevent the application finding an existing function. A cache reload does not install a missing function.

This is a structural check, not proof that the original SQL file ran at a particular time or that its function bodies have never changed. It does not validate every policy, grant, constraint, index or catalog price. It does not prove email delivery, Bachs credentials/webhooks, browser push or hosted deployment configuration is working. Those require their own acceptance checks.

If migrations were applied through the Supabase CLI, Dashboard migration history may provide additional execution records. Files pasted manually into SQL Editor are not, by themselves, evidence of an entry in that migration history.

`upgrade-team-admin.sql` bundles migrations **003–005**. It is an alternative to those three individual files, not another migration to run after them. Never apply both copies.

`bootstrap-platform-owner.sql` is a separate one-time data setup, not migration 010. Once row 004 is PRESENT, this additional read-only query checks whether any platform owners/admins are configured without showing their emails:

```sql
select role, count(*) as accounts
from public.platform_admins
group by role
order by role;
```

No owner row means platform owner access has not been established or has since been removed. A row does not prove that the account you are currently signing in with has that role or a confirmed email. Do not rerun the bootstrap automatically.

Share the report rows to identify the next missing upgrade. Do not share database passwords, API secrets or reset-link tokens.
