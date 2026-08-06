ALTER TABLE users
ADD COLUMN IF NOT EXISTS prestige_level INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'users_prestige_level_non_negative'
    ) THEN
        ALTER TABLE users
        ADD CONSTRAINT users_prestige_level_non_negative
        CHECK (prestige_level >= 0);
    END IF;
END $$;
