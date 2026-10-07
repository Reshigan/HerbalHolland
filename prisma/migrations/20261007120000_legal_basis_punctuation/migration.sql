-- The default legal-basis lines (src/lib/compliance.ts DEFAULT_LEGAL_BASIS) now use a colon, not an em-dash.
-- Products still carrying an old default get the new text, so a class change keeps recognising it as a default.
UPDATE "Product" SET "legalBasis" = 'SAHPRA licence: medical pathway (Section 21 authorisation required)' WHERE "legalBasis" = 'SAHPRA licence — medical pathway (Section 21 authorisation required)';
UPDATE "Product" SET "legalBasis" = 'Schedule 0 CBD: GN 586 of 22 May 2020' WHERE "legalBasis" = 'Schedule 0 CBD — GN 586 of 22 May 2020';
UPDATE "Product" SET "legalBasis" = 'CBD food: GN 586 of 22 May 2020 (≤ 0.0075% CBD, naturally occurring)' WHERE "legalBasis" = 'CBD food — GN 586 of 22 May 2020 (≤ 0.0075% CBD, naturally occurring)';
UPDATE "Product" SET "legalBasis" = 'Cosmetic: Foodstuffs, Cosmetics and Disinfectants Act 54 of 1972' WHERE "legalBasis" = 'Cosmetic — Foodstuffs, Cosmetics and Disinfectants Act 54 of 1972';
UPDATE "Product" SET "legalBasis" = 'Hemp: Schedule 6 exclusion, GN 586 of 22 May 2020 (≤ 0.2% THC, not for ingestion; hemp-seed food ≤ 0.001%)' WHERE "legalBasis" = 'Hemp — Schedule 6 exclusion, GN 586 of 22 May 2020 (≤ 0.2% THC, not for ingestion; hemp-seed food ≤ 0.001%)';
UPDATE "Product" SET "legalBasis" = 'Foodstuff: Foodstuffs, Cosmetics and Disinfectants Act 54 of 1972 (labelling: R146)' WHERE "legalBasis" = 'Foodstuff — Foodstuffs, Cosmetics and Disinfectants Act 54 of 1972 (labelling: R146)';
