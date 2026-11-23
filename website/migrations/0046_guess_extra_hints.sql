-- 仅附加配置与公开线索，不改答案密文、资金、历史获奖记录。
ALTER TABLE ldc_packets ADD COLUMN auto_hint_every INTEGER NOT NULL DEFAULT 0 CHECK(auto_hint_every BETWEEN 0 AND 1000);
ALTER TABLE ldc_packets ADD COLUMN extra_hints_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(extra_hints_json) AND json_type(extra_hints_json)='array');
ALTER TABLE guess_free_rounds ADD COLUMN auto_hint_every INTEGER NOT NULL DEFAULT 0 CHECK(auto_hint_every BETWEEN 0 AND 1000);
ALTER TABLE guess_free_rounds ADD COLUMN extra_hints_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(extra_hints_json) AND json_type(extra_hints_json)='array');
