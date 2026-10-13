-- Questionnaire schema v2 (docs/step-05-questionnaire.md, decision P19):
-- five question ids were renumbered to match "ELATION questionnaire.docx".
-- Rename the keys inside stored answers / "Elation decides" flags so data
-- saved under v1 keeps working. Order matters: q16_entrance moves away
-- before q13_colours takes the q16 slot.

CREATE FUNCTION pg_temp.rename_key(doc jsonb, old_key text, new_key text) RETURNS jsonb AS $$
  SELECT CASE WHEN doc ? old_key
    THEN (doc - old_key) || jsonb_build_object(new_key, doc -> old_key)
    ELSE doc END
$$ LANGUAGE sql IMMUTABLE;

CREATE FUNCTION pg_temp.v2_ids(doc jsonb) RETURNS jsonb AS $$
  SELECT pg_temp.rename_key(pg_temp.rename_key(pg_temp.rename_key(pg_temp.rename_key(pg_temp.rename_key(doc,
    'q16_entrance', 'q22_entrance'),
    'q17_entrance_style', 'q23_entrance_style'),
    'q13_colours', 'q16_colours'),
    'q14_direction', 'q20_direction'),
    'q15_metallic', 'q21_metallic')
$$ LANGUAGE sql IMMUTABLE;

UPDATE "QuestionnaireResponse"
SET "answers" = pg_temp.v2_ids("answers"),
    "elationDecides" = pg_temp.v2_ids("elationDecides"),
    "schemaVersion" = 2
WHERE "schemaVersion" < 2;
