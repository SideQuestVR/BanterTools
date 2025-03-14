CREATE TABLE `users` (
  `id` BIGSERIAL NOT NULL AUTO_INCREMENT,
  `ext_id` varchar(1024) NOT NULL,
  `name` varchar(1024) NOT NULL,
  `profile_pic` varchar(2048) DEFAULT NULL,
  `color` varchar(8) DEFAULT NULL,
  `bio` varchar(16000) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `kits` (
  `id` BIGSERIAL NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  `name` varchar(1024) NOT NULL,
  `description` varchar(16000) DEFAULT NULL,
  `android` varchar(2048) DEFAULT NULL,
  `windows` varchar(2048) DEFAULT NULL,
  `item_count` int DEFAULT 0,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


CREATE TABLE `kit_items` (
  `id` BIGSERIAL NOT NULL AUTO_INCREMENT,
  `kits_id` BIGINT NOT NULL,
  `name` varchar(1024) NOT NULL,
  `description` varchar(16000) DEFAULT NULL,
  `picture` varchar(2048) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`kits_id`) REFERENCES `kits`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;