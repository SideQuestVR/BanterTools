CREATE DATABASE markit WITH TEMPLATE = template0 OWNER = postgres;

\connect markit

CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY NOT NULL,
  ext_id varchar(1024) NOT NULL,
  name varchar(1024) NOT NULL,
  profile_pic varchar(2048) DEFAULT NULL,
  color varchar(8) DEFAULT NULL,
  bio varchar(16000) DEFAULT NULL,
  created_at timestamp DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE kits (
  id BIGSERIAL PRIMARY KEY NOT NULL,
  users_id BIGINT NOT NULL,
  name varchar(1024) NOT NULL,
  description varchar(16000) DEFAULT NULL,
  picture varchar(2048) DEFAULT NULL,
  android varchar(2048) DEFAULT NULL,
  windows varchar(2048) DEFAULT NULL,
  item_count int DEFAULT 0,
  created_at timestamp DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (users_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE kit_items (
  id BIGSERIAL PRIMARY KEY NOT NULL,
  kits_id BIGINT NOT NULL,
  name varchar(1024) NOT NULL,
  path varchar(2048) NOT NULL,
  picture varchar(2048) DEFAULT NULL,
  created_at timestamp DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (kits_id) REFERENCES kits(id) ON DELETE CASCADE
);



CREATE TABLE kit_categories (
  id BIGSERIAL PRIMARY KEY NOT NULL,
  name varchar(1024) NOT NULL,
  description varchar(16000) DEFAULT NULL,
  picture varchar(2048) DEFAULT NULL,
  item_count int DEFAULT 0,
  created_at timestamp DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE kits ADD COLUMN kit_categories_id bigint NOT NULL, ADD FOREIGN KEY (kit_categories_id) REFERENCES kit_categories(id) ON DELETE CASCADE;

ALTER TABLE kits ADD use_count bigint DEFAULT 0;
ALTER TABLE kit_items ADD use_count bigint DEFAULT 0;