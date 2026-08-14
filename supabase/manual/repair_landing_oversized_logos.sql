-- Repair blank public landing caused by multi-MB data-URL logos in landing_config.
-- Those bloated SSR HTML (~14MB), corrupted TanStack dehydrate (lastMatchId), and
-- left a white screen after hydrate. App code now strips oversized data URLs on read;
-- this heals the stored row so Platform → Landing also shows clean fields.
--
-- Paste into Supabase SQL Editor and run once.

UPDATE public.landing_config
SET
  config = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          config,
          '{brand,logo_url}',
          CASE
            WHEN length(coalesce(config #>> '{brand,logo_url}', '')) > 550000
              THEN to_jsonb(''::text)
            ELSE coalesce(config #> '{brand,logo_url}', '""'::jsonb)
          END,
          true
        ),
        '{brand,logo_url_landing}',
        CASE
          WHEN length(coalesce(config #>> '{brand,logo_url_landing}', '')) > 550000
            THEN to_jsonb(''::text)
          ELSE coalesce(config #> '{brand,logo_url_landing}', '""'::jsonb)
        END,
        true
      ),
      '{brand,logo_url_auth}',
      CASE
        WHEN length(coalesce(config #>> '{brand,logo_url_auth}', '')) > 550000
          THEN to_jsonb(''::text)
        ELSE coalesce(config #> '{brand,logo_url_auth}', '""'::jsonb)
      END,
      true
    ),
    '{brand,logo_url_app}',
    CASE
      WHEN length(coalesce(config #>> '{brand,logo_url_app}', '')) > 550000
        THEN to_jsonb(''::text)
      ELSE coalesce(config #> '{brand,logo_url_app}', '""'::jsonb)
    END,
    true
  ),
  updated_at = now()
WHERE id = 'singleton';

-- Verify remaining brand logo sizes (should all be << 550000)
SELECT
  length(coalesce(config #>> '{brand,logo_url}', '')) AS logo_url_len,
  length(coalesce(config #>> '{brand,logo_url_landing}', '')) AS landing_len,
  length(coalesce(config #>> '{brand,logo_url_auth}', '')) AS auth_len,
  length(coalesce(config #>> '{brand,logo_url_app}', '')) AS app_len
FROM public.landing_config
WHERE id = 'singleton';
