CREATE TABLE IF NOT EXISTS employee_face_images (
  tenant_id BIGINT UNSIGNED NOT NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  image MEDIUMBLOB NOT NULL,
  mime_type VARCHAR(30) NOT NULL,
  updated_by BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (tenant_id,employee_id),
  CONSTRAINT fk_face_image_employee FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
