-- Mass tag all untagged ae_products based on AliExpress category_id
BEGIN;

-- 1. Walkie Talkie (1368)
UPDATE ae_products SET product_type = 'Walkie Talkie', product_type_ro = 'Statii Radio' WHERE product_type IS NULL AND category_id = 50906;
-- 2. Shorts barbati (622)
UPDATE ae_products SET product_type = 'Shorts', product_type_ro = 'Pantaloni Scurti' WHERE product_type IS NULL AND category_id = 200000382;
-- 3. Bras (583)
UPDATE ae_products SET product_type = 'Bras', product_type_ro = 'Sutiene' WHERE product_type IS NULL AND category_id = 31201;
-- 4. Girls Clothing (427)
UPDATE ae_products SET product_type = 'Girls Clothing', product_type_ro = 'Imbracaminte Fete' WHERE product_type IS NULL AND category_id = 200001527;
-- 5. Women Outerwear Coats (499)
UPDATE ae_products SET product_type = 'Coats', product_type_ro = 'Paltoane si Geci' WHERE product_type IS NULL AND category_id IN (200000801, 200000848);
-- 6. Swim Trunks (327)
UPDATE ae_products SET product_type = 'Swimwear', product_type_ro = 'Costume de Baie' WHERE product_type IS NULL AND category_id = 201206104;
-- 7. Baby Girls Clothing (279)
UPDATE ae_products SET product_type = 'Baby Clothing', product_type_ro = 'Imbracaminte Bebelusi' WHERE product_type IS NULL AND category_id = 200003572;
-- 8. Mens Underwear (264)
UPDATE ae_products SET product_type = 'Boxer Briefs', product_type_ro = 'Boxeri si Lenjerie Barbati' WHERE product_type IS NULL AND category_id = 200001863;
-- 9. Wedding Events (98)
UPDATE ae_products SET product_type = 'Dresses', product_type_ro = 'Rochii' WHERE product_type IS NULL AND category_id = 201174704;
-- 10. Unknown category (90)
UPDATE ae_products SET product_type = 'Other', product_type_ro = 'Altele' WHERE product_type IS NULL AND category_id = 202196203;
-- 11. Two Piece Sets (87)
UPDATE ae_products SET product_type = 'Activewear', product_type_ro = 'Seturi si Treninguri' WHERE product_type IS NULL AND category_id = 200003588;
-- 12. Evening Dresses (81)
UPDATE ae_products SET product_type = 'Dresses', product_type_ro = 'Rochii' WHERE product_type IS NULL AND category_id = 201208404;
-- 13. Boys Clothing (54)
UPDATE ae_products SET product_type = 'Boys Clothing', product_type_ro = 'Imbracaminte Baieti' WHERE product_type IS NULL AND category_id = 200001524;
-- 14. Baby Boys Clothing (53)
UPDATE ae_products SET product_type = 'Baby Clothing', product_type_ro = 'Imbracaminte Bebelusi' WHERE product_type IS NULL AND category_id = 200003532;
-- 15. Panties (43)
UPDATE ae_products SET product_type = 'Panties', product_type_ro = 'Chiloti Femei' WHERE product_type IS NULL AND category_id = 351;
-- 16. Bridesmaid Dresses (41)
UPDATE ae_products SET product_type = 'Dresses', product_type_ro = 'Rochii' WHERE product_type IS NULL AND category_id = 201906402;
-- 17. Jumpsuits (37)
UPDATE ae_products SET product_type = 'Bodysuits', product_type_ro = 'Salopete' WHERE product_type IS NULL AND category_id = 201240611;
-- 18. Baby Accessories (35)
UPDATE ae_products SET product_type = 'Baby Clothing', product_type_ro = 'Accesorii Bebelusi' WHERE product_type IS NULL AND category_id = 200001526;
-- 19. Womens Flats (19)
UPDATE ae_products SET product_type = 'Shoes', product_type_ro = 'Incaltaminte' WHERE product_type IS NULL AND category_id = 201202605;
-- 20. Corsets (19)
UPDATE ae_products SET product_type = 'Bodysuits', product_type_ro = 'Corsete' WHERE product_type IS NULL AND category_id = 100000651;
-- 21. Womens Boots (13)
UPDATE ae_products SET product_type = 'Shoes', product_type_ro = 'Incaltaminte' WHERE product_type IS NULL AND category_id = 201204905;
-- 22. Slips (7)
UPDATE ae_products SET product_type = 'Panties', product_type_ro = 'Lenjerie Femei' WHERE product_type IS NULL AND category_id = 31205;
-- 23. Tops Tees (9)
UPDATE ae_products SET product_type = 'T-Shirts', product_type_ro = 'Tricouri' WHERE product_type IS NULL AND category_id = 200000790;
-- 24. Tank Tops (9)
UPDATE ae_products SET product_type = 'Tank Tops', product_type_ro = 'Maiouri' WHERE product_type IS NULL AND category_id = 200000791;
-- 25. Thermal Underwear (8)
UPDATE ae_products SET product_type = 'Thermal Underwear', product_type_ro = 'Lenjerie Termica' WHERE product_type IS NULL AND category_id = 201247506;
-- 26. Kids Accessories (8)
UPDATE ae_products SET product_type = 'Baby Clothing', product_type_ro = 'Accesorii Copii' WHERE product_type IS NULL AND category_id = 200001529;
-- 27. Childrens Underwear (19)
UPDATE ae_products SET product_type = 'Baby Clothing', product_type_ro = 'Lenjerie Copii' WHERE product_type IS NULL AND category_id = 202233016;
-- 28. Intimates (9)
UPDATE ae_products SET product_type = 'Panties', product_type_ro = 'Lenjerie Intima' WHERE product_type IS NULL AND category_id = 200001516;
-- 29. Feeding (7)
UPDATE ae_products SET product_type = 'Baby Clothing', product_type_ro = 'Accesorii Bebelusi' WHERE product_type IS NULL AND category_id = 200001510;

-- CATCH ALL REMAINING
UPDATE ae_products SET product_type = 'Other', product_type_ro = 'Altele' WHERE product_type IS NULL;

COMMIT;
