-- 新图片红包上传不可逆的线索图；旧红包两列为 NULL，详情不得回退原图。
ALTER TABLE chat_redpacks ADD COLUMN clue_key TEXT;
ALTER TABLE chat_redpacks ADD COLUMN mask_bits INTEGER CHECK(mask_bits IS NULL OR mask_bits BETWEEN 1 AND 511);
