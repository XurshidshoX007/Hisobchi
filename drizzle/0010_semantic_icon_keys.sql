-- Category and goal icons move from emoji to semantic keys resolved by
-- src/components/icon.tsx. The columns already hold user-writable free text
-- (Accounts and Goals both expose an icon field), so this migration only
-- rewrites values the product itself wrote; anything else is left untouched and
-- still renders, because <Icon> falls back to the raw glyph.
--
-- The mapping below MUST stay in sync with LEGACY_EMOJI in src/components/icon.tsx.

ALTER TABLE "categories" ALTER COLUMN "icon" SET DEFAULT 'dot';
--> statement-breakpoint
ALTER TABLE "goals" ALTER COLUMN "icon" SET DEFAULT 'target';
--> statement-breakpoint
UPDATE "categories" SET "icon" = CASE "icon"
  WHEN '🏠' THEN 'home'
  WHEN '🔑' THEN 'key'
  WHEN '💡' THEN 'utilities'
  WHEN '🛠' THEN 'repair'
  WHEN '🛠️' THEN 'repair'
  WHEN '🥗' THEN 'food'
  WHEN '🍎' THEN 'food'
  WHEN '🚕' THEN 'transport'
  WHEN '🚌' THEN 'transport'
  WHEN '🚗' THEN 'transport'
  WHEN '🏦' THEN 'bank'
  WHEN '📱' THEN 'phone'
  WHEN '👨‍👩‍👧' THEN 'family'
  WHEN '💊' THEN 'health'
  WHEN '📚' THEN 'education'
  WHEN '👕' THEN 'clothing'
  WHEN '🎬' THEN 'entertainment'
  WHEN '💼' THEN 'salary'
  WHEN '🏪' THEN 'business'
  WHEN '🎁' THEN 'gift'
  WHEN '✨' THEN 'sparkle'
  WHEN '🤝' THEN 'return'
  WHEN '💵' THEN 'wallet'
  WHEN '💳' THEN 'card'
  WHEN '💰' THEN 'wallet'
  WHEN '🎯' THEN 'target'
  WHEN '📊' THEN 'chart'
  WHEN '📋' THEN 'doc'
  WHEN '📄' THEN 'doc'
  WHEN '🏆' THEN 'goal'
  WHEN '🏷️' THEN 'tag'
  WHEN '•' THEN 'dot'
  ELSE "icon"
END
WHERE "icon" IN (
  '🏠','🔑','💡','🛠','🛠️','🥗','🍎','🚕','🚌','🚗','🏦','📱','👨‍👩‍👧','💊','📚','👕','🎬',
  '💼','🏪','🎁','✨','🤝','💵','💳','💰','🎯','📊','📋','📄','🏆','🏷️','•'
);
--> statement-breakpoint
UPDATE "goals" SET "icon" = CASE "icon"
  WHEN '🎯' THEN 'target'
  WHEN '🚗' THEN 'transport'
  WHEN '🛟' THEN 'shield'
  WHEN '✈️' THEN 'telegram'
  WHEN '🏠' THEN 'home'
  WHEN '🏆' THEN 'goal'
  WHEN '💰' THEN 'wallet'
  WHEN '💵' THEN 'wallet'
  WHEN '🎓' THEN 'education'
  WHEN '•' THEN 'dot'
  ELSE "icon"
END
WHERE "icon" IN ('🎯','🚗','🛟','✈️','🏠','🏆','💰','💵','🎓','•');
