-- ============================================================================
-- Project descriptions — run this ONCE in the Supabase SQL editor.
-- The categorization prompt lists each project with its description, so the
-- model knows what "FON" or "Other" means instead of guessing from the name.
-- ============================================================================

alter table projects add column if not exists description text;

-- Descriptions for the existing projects (rules agreed on 2026-10-16: projects
-- by topic, FON only for the faculty itself).
update projects set description = 'fakultet kao takav: study planovi, predmeti, kolokvijumi i obaveze, diplomski (tehničko znanje sa predmeta ide po temi, npr. u Software Engineering)' where name = 'FON';
update projects set description = 'aplikacija za porodični restoran (palačinkarna): funkcionalnosti, kod, odluke i ono što učim direktno za nju' where name = 'Glumac Plus';
update projects set description = 'timska platforma za ruralni turizam: arhitektura, stack, odluke, tim' where name = 'Village Booker';
update projects set description = '.NET aplikacija za zajedničke kućne obaveze (household tasks)' where name = 'Hearth';
update projects set description = 'hardverski i IoT projekti: ESP32, senzori, Srećna biljka' where name = 'IoT';
update projects set description = 'opšte programiranje van projekata: backend, frontend, testiranje, alati, CS osnove, system design' where name = 'Software Engineering';
update projects set description = 'AI i ML: LLM-ovi, RAG, agenti, modeli, kursevi i resursi za AI karijeru' where name = 'AI Engineering';
update projects set description = 'život van koda: finansije, trening, karijera i prijave za posao, knjige, planovi' where name = 'Personal';
update projects set description = 'znanje iz drugih oblasti: fintech, biznis' where name = 'Other';
