-- Extra Gauteng clinics — INSERT OR IGNORE so it's safe to re-run

-- ── Soweto extended ─────────────────────────────────────────────────────────
INSERT OR IGNORE INTO clinics (id,name,address,lat,lng,base_wait_time_minutes,current_queue_count,services,operating_hours,capacity_per_day,has_electricity,has_solar,open_time,close_time)
VALUES ('c10','Zola Community Health Centre','Ntuli Rd, Zola, Soweto, 1820',-26.2271,27.8534,60,18,'["General Practitioner","HIV/AIDS Care","Family Planning","Vaccinations"]','07:30 - 16:00',90,1,0,'07:30','16:00');

INSERT OR IGNORE INTO clinics (id,name,address,lat,lng,base_wait_time_minutes,current_queue_count,services,operating_hours,capacity_per_day,has_electricity,has_solar,open_time,close_time)
VALUES ('c11','Dobsonville Community Health Centre','Ipelegeng Rd, Dobsonville, Soweto, 1863',-26.2099,27.8389,50,11,'["General Practitioner","Pediatrics","Chronic Medication","TB Care"]','08:00 - 16:30',80,1,1,'08:00','16:30');

INSERT OR IGNORE INTO clinics (id,name,address,lat,lng,base_wait_time_minutes,current_queue_count,services,operating_hours,capacity_per_day,has_electricity,has_solar,open_time,close_time)
VALUES ('c12','Naledi Clinic','Naledi, Soweto, 1809',-26.2794,27.8815,35,6,'["General Practitioner","Vaccinations","Chronic Medication"]','07:30 - 15:30',50,1,0,'07:30','15:30');

INSERT OR IGNORE INTO clinics (id,name,address,lat,lng,base_wait_time_minutes,current_queue_count,services,operating_hours,capacity_per_day,has_electricity,has_solar,open_time,close_time)
VALUES ('c13','Diepkloof Zone 4 Clinic','Zone 4, Diepkloof, Soweto, 1864',-26.2489,27.9413,45,9,'["General Practitioner","HIV/AIDS Care","Family Planning"]','08:00 - 16:00',70,1,0,'08:00','16:00');

INSERT OR IGNORE INTO clinics (id,name,address,lat,lng,base_wait_time_minutes,current_queue_count,services,operating_hours,capacity_per_day,has_electricity,has_solar,open_time,close_time)
VALUES ('c14','Mofolo North Clinic','Mofolo North, Soweto, 1861',-26.2373,27.8898,40,7,'["General Practitioner","TB Care","Chronic Medication","Vaccinations"]','07:30 - 15:30',60,0,1,'07:30','15:30');

INSERT OR IGNORE INTO clinics (id,name,address,lat,lng,base_wait_time_minutes,current_queue_count,services,operating_hours,capacity_per_day,has_electricity,has_solar,open_time,close_time)
VALUES ('c15','Jabavu Community Health Centre','White City, Jabavu, Soweto, 1808',-26.2582,27.8706,70,21,'["General Practitioner","HIV/AIDS Care","Maternity","Pharmacy","Vaccinations"]','07:30 - 16:00',120,1,1,'07:30','16:00');

INSERT OR IGNORE INTO clinics (id,name,address,lat,lng,base_wait_time_minutes,current_queue_count,services,operating_hours,capacity_per_day,has_electricity,has_solar,open_time,close_time)
VALUES ('c16','Pimville Community Health Centre','Pimville, Soweto, 1809',-26.2825,27.9230,55,13,'["General Practitioner","Pediatrics","HIV/AIDS Care","Family Planning"]','08:00 - 16:00',85,1,0,'08:00','16:00');

INSERT OR IGNORE INTO clinics (id,name,address,lat,lng,base_wait_time_minutes,current_queue_count,services,operating_hours,capacity_per_day,has_electricity,has_solar,open_time,close_time)
VALUES ('c17','Moroka Community Clinic','Moroka, Soweto, 1832',-26.2621,27.9097,30,5,'["General Practitioner","Chronic Medication","TB Care"]','08:00 - 16:00',55,1,0,'08:00','16:00');

INSERT OR IGNORE INTO clinics (id,name,address,lat,lng,base_wait_time_minutes,current_queue_count,services,operating_hours,capacity_per_day,has_electricity,has_solar,open_time,close_time)
VALUES ('c18','Protea Glen Clinic','Protea Glen, Soweto, 1818',-26.2891,27.8411,25,3,'["General Practitioner","Vaccinations","Family Planning"]','08:00 - 15:30',45,1,1,'08:00','15:30');

-- ── Alexandra ────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO clinics (id,name,address,lat,lng,base_wait_time_minutes,current_queue_count,services,operating_hours,capacity_per_day,has_electricity,has_solar,open_time,close_time)
VALUES ('c19','Alexandra Community Health Centre','Far East Bank, Alexandra, Johannesburg, 2090',-26.1026,28.0951,65,23,'["General Practitioner","HIV/AIDS Care","Maternity","Pediatrics","Pharmacy"]','07:30 - 16:30',130,1,1,'07:30','16:30');

-- ── Tembisa / Ekurhuleni ─────────────────────────────────────────────────────
INSERT OR IGNORE INTO clinics (id,name,address,lat,lng,base_wait_time_minutes,current_queue_count,services,operating_hours,capacity_per_day,has_electricity,has_solar,open_time,close_time)
VALUES ('c20','Tembisa Community Health Centre','Tembisa, Ekurhuleni, 1628',-26.0042,28.2290,75,27,'["General Practitioner","HIV/AIDS Care","Maternity","Pediatrics","Pharmacy"]','24 Hours',160,1,1,'00:00','23:59');

INSERT OR IGNORE INTO clinics (id,name,address,lat,lng,base_wait_time_minutes,current_queue_count,services,operating_hours,capacity_per_day,has_electricity,has_solar,open_time,close_time)
VALUES ('c21','Katlehong Community Health Centre','Katlehong, Ekurhuleni, 1431',-26.3621,28.1502,60,16,'["General Practitioner","HIV/AIDS Care","Family Planning","TB Care"]','07:30 - 16:00',100,1,0,'07:30','16:00');

-- ── Pretoria / Tshwane ───────────────────────────────────────────────────────
INSERT OR IGNORE INTO clinics (id,name,address,lat,lng,base_wait_time_minutes,current_queue_count,services,operating_hours,capacity_per_day,has_electricity,has_solar,open_time,close_time)
VALUES ('c22','Mamelodi Community Health Centre','Mamelodi East, Tshwane, 0122',-25.7059,28.3941,80,29,'["General Practitioner","HIV/AIDS Care","Maternity","Pediatrics","Vaccinations"]','24 Hours',150,1,1,'00:00','23:59');

INSERT OR IGNORE INTO clinics (id,name,address,lat,lng,base_wait_time_minutes,current_queue_count,services,operating_hours,capacity_per_day,has_electricity,has_solar,open_time,close_time)
VALUES ('c23','Soshanguve Community Health Centre','Block H, Soshanguve, Tshwane, 0152',-25.5261,28.0882,70,19,'["General Practitioner","HIV/AIDS Care","Dentistry","Pharmacy","Vaccinations"]','07:30 - 16:00',120,1,0,'07:30','16:00');

INSERT OR IGNORE INTO clinics (id,name,address,lat,lng,base_wait_time_minutes,current_queue_count,services,operating_hours,capacity_per_day,has_electricity,has_solar,open_time,close_time)
VALUES ('c24','Atteridgeville Community Health Centre','Atteridgeville, Tshwane, 0008',-25.7728,27.9944,55,15,'["General Practitioner","HIV/AIDS Care","Family Planning","Chronic Medication"]','08:00 - 16:00',90,0,1,'08:00','16:00');

-- ── West Rand ────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO clinics (id,name,address,lat,lng,base_wait_time_minutes,current_queue_count,services,operating_hours,capacity_per_day,has_electricity,has_solar,open_time,close_time)
VALUES ('c25','Kagiso Community Health Centre','Kagiso, Mogale City, 1754',-26.1650,27.7771,45,10,'["General Practitioner","HIV/AIDS Care","Vaccinations","TB Care"]','07:30 - 16:00',80,1,0,'07:30','16:00');

INSERT OR IGNORE INTO clinics (id,name,address,lat,lng,base_wait_time_minutes,current_queue_count,services,operating_hours,capacity_per_day,has_electricity,has_solar,open_time,close_time)
VALUES ('c26','Bekkersdal Community Health Centre','Bekkersdal, Westonaria, 1779',-26.3432,27.6678,50,12,'["General Practitioner","HIV/AIDS Care","Family Planning","Pharmacy"]','07:30 - 15:30',75,0,1,'07:30','15:30');

-- ── Sedibeng / South Gauteng ─────────────────────────────────────────────────
INSERT OR IGNORE INTO clinics (id,name,address,lat,lng,base_wait_time_minutes,current_queue_count,services,operating_hours,capacity_per_day,has_electricity,has_solar,open_time,close_time)
VALUES ('c27','Orange Farm Community Health Centre','Orange Farm, Johannesburg South, 1804',-26.4880,27.8473,85,33,'["General Practitioner","HIV/AIDS Care","Maternity","Pediatrics","Pharmacy"]','07:30 - 16:30',140,1,1,'07:30','16:30');

INSERT OR IGNORE INTO clinics (id,name,address,lat,lng,base_wait_time_minutes,current_queue_count,services,operating_hours,capacity_per_day,has_electricity,has_solar,open_time,close_time)
VALUES ('c28','Evaton Community Health Centre','Evaton, Sedibeng, 1984',-26.5157,27.9239,60,17,'["General Practitioner","HIV/AIDS Care","Chronic Medication","Vaccinations"]','08:00 - 16:00',95,1,0,'08:00','16:00');

INSERT OR IGNORE INTO clinics (id,name,address,lat,lng,base_wait_time_minutes,current_queue_count,services,operating_hours,capacity_per_day,has_electricity,has_solar,open_time,close_time)
VALUES ('c29','Lenasia Community Health Centre','Lenasia, Johannesburg South, 1827',-26.3012,27.8297,40,8,'["General Practitioner","Dentistry","Pediatrics","Vaccinations","Pharmacy"]','08:00 - 17:00',70,1,1,'08:00','17:00');

-- ── Johannesburg Metro extra ──────────────────────────────────────────────────
INSERT OR IGNORE INTO clinics (id,name,address,lat,lng,base_wait_time_minutes,current_queue_count,services,operating_hours,capacity_per_day,has_electricity,has_solar,open_time,close_time)
VALUES ('c30','Ivory Park Community Health Centre','Ivory Park, Midrand, 1685',-26.0201,28.1892,70,22,'["General Practitioner","HIV/AIDS Care","Maternity","Family Planning"]','24 Hours',130,1,0,'00:00','23:59');

INSERT OR IGNORE INTO clinics (id,name,address,lat,lng,base_wait_time_minutes,current_queue_count,services,operating_hours,capacity_per_day,has_electricity,has_solar,open_time,close_time)
VALUES ('c31','Westbury Community Clinic','Westbury, Johannesburg West, 2092',-26.1836,27.9682,35,7,'["General Practitioner","HIV/AIDS Care","Chronic Medication","Vaccinations"]','08:00 - 16:00',60,1,1,'08:00','16:00');

INSERT OR IGNORE INTO clinics (id,name,address,lat,lng,base_wait_time_minutes,current_queue_count,services,operating_hours,capacity_per_day,has_electricity,has_solar,open_time,close_time)
VALUES ('c32','Soweto South Community Clinic','Ennerdale, Johannesburg South, 1786',-26.4137,27.8771,45,9,'["General Practitioner","TB Care","Chronic Medication","Family Planning"]','08:00 - 15:30',65,0,1,'08:00','15:30');
