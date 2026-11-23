-- Keep already created rounds and older clients on their existing rules.
ALTER TABLE ldc_packets ADD COLUMN hint_source TEXT NOT NULL DEFAULT 'legacy' CHECK(hint_source IN('legacy','ai','preset'));
ALTER TABLE ldc_packets ADD COLUMN preset_hint_trigger TEXT NOT NULL DEFAULT 'cooldown' CHECK(preset_hint_trigger IN('cooldown','guesses'));
ALTER TABLE ldc_packets ADD COLUMN hint_cooldown_seconds INTEGER NOT NULL DEFAULT 30 CHECK(hint_cooldown_seconds BETWEEN 1 AND 86400);
ALTER TABLE guess_free_rounds ADD COLUMN hint_source TEXT NOT NULL DEFAULT 'legacy' CHECK(hint_source IN('legacy','ai','preset'));
ALTER TABLE guess_free_rounds ADD COLUMN preset_hint_trigger TEXT NOT NULL DEFAULT 'cooldown' CHECK(preset_hint_trigger IN('cooldown','guesses'));
ALTER TABLE guess_free_rounds ADD COLUMN hint_cooldown_seconds INTEGER NOT NULL DEFAULT 30 CHECK(hint_cooldown_seconds BETWEEN 1 AND 86400);
