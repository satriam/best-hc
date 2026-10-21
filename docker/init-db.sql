-- Best HCM — init database saat container PostgreSQL pertama kali dibuat.
-- besthcm_prod dibuat oleh POSTGRES_DB; di sini hanya memastikan dev ada.
-- (Untuk instalasi yang sudah berjalan, jalankan manual:
--    CREATE DATABASE besthcm_dev;
--  lalu  npm run db:mirror  agar isinya mirror production.)

SELECT 'CREATE DATABASE besthcm_dev'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'besthcm_dev')\gexec
