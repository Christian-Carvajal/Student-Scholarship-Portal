-- =============================================================
-- Student Scholarship Portal - Complete Database Script
-- Target: MySQL 8.0+
-- =============================================================
-- This script creates a fully connected schema for:
-- - Authentication (student + admin)
-- - Scholarships publishing and browsing
-- - Scholarship applications and admin review decisions
-- - Student tracker summaries and lists
-- - Student document management
-- - Notifications for students and admins
--
-- IMPORTANT:
-- 1) This script does NOT delete existing student/admin accounts.
-- 2) A safe cleanup procedure is included: sp_clear_test_data_keep_accounts().
-- 3) "fund_amount" is intentionally removed from scholarships.
-- =============================================================

SET NAMES utf8mb4;
SET time_zone = '+08:00';

CREATE DATABASE IF NOT EXISTS scholarship_portal
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE scholarship_portal;

-- -------------------------------------------------------------
-- Drop views/events/procedures/triggers for safe re-run
-- -------------------------------------------------------------
DROP VIEW IF EXISTS vw_admin_dashboard_metrics;
DROP VIEW IF EXISTS vw_admin_application_status_summary;
DROP VIEW IF EXISTS vw_admin_review_queue;
DROP VIEW IF EXISTS vw_student_application_list;
DROP VIEW IF EXISTS vw_student_tracker_summary;
DROP VIEW IF EXISTS vw_browse_scholarships;

DROP EVENT IF EXISTS ev_daily_deadline_notifications;

DROP PROCEDURE IF EXISTS sp_generate_deadline_notifications;
DROP PROCEDURE IF EXISTS sp_clear_test_data_keep_accounts;

DROP TRIGGER IF EXISTS trg_auth_accounts_before_delete_protected;
DROP TRIGGER IF EXISTS trg_scholarships_before_insert_publish;
DROP TRIGGER IF EXISTS trg_scholarships_before_update_publish;
DROP TRIGGER IF EXISTS trg_scholarships_after_insert_notify_students;
DROP TRIGGER IF EXISTS trg_scholarships_after_update_notify_students;
DROP TRIGGER IF EXISTS trg_applications_after_insert;
DROP TRIGGER IF EXISTS trg_applications_after_update;

-- -------------------------------------------------------------
-- Core entities
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS students (
  student_id VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  program VARCHAR(150) NULL,
  year_level TINYINT UNSIGNED NULL,
  gpa DECIMAL(4,2) NULL,
  date_of_birth DATE NULL,
  address TEXT NULL,
  contact_number VARCHAR(30) NULL,
  learner_reference_number VARCHAR(60) NULL,
  family_income DECIMAL(12,2) NULL,
  parent_occupation VARCHAR(150) NULL,
  special_membership ENUM('none', 'indigenous', 'pwd', 'solo_parent') NOT NULL DEFAULT 'none',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (student_id),
  UNIQUE KEY uq_students_email (email),
  UNIQUE KEY uq_students_lrn (learner_reference_number),
  CONSTRAINT chk_students_gpa_range CHECK (gpa IS NULL OR (gpa >= 1.00 AND gpa <= 5.00)),
  CONSTRAINT chk_students_year_level CHECK (year_level IS NULL OR (year_level >= 1 AND year_level <= 10))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS admins (
  admin_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (admin_id),
  UNIQUE KEY uq_admins_email (email)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS auth_accounts (
  account_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  role ENUM('student', 'admin') NOT NULL,
  student_id VARCHAR(50) NULL,
  admin_id INT UNSIGNED NULL,
  username VARCHAR(60) NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_protected TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (account_id),
  UNIQUE KEY uq_auth_accounts_student (student_id),
  UNIQUE KEY uq_auth_accounts_admin (admin_id),
  UNIQUE KEY uq_auth_accounts_username (username),
  UNIQUE KEY uq_auth_accounts_email (email),
  CONSTRAINT fk_auth_accounts_student FOREIGN KEY (student_id) REFERENCES students(student_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_auth_accounts_admin FOREIGN KEY (admin_id) REFERENCES admins(admin_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_auth_accounts_role_link CHECK (
    (role = 'student' AND student_id IS NOT NULL AND admin_id IS NULL)
    OR
    (role = 'admin' AND admin_id IS NOT NULL AND student_id IS NULL)
  )
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS scholarships (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  deadline DATE NOT NULL,
  status ENUM('draft', 'published', 'closed', 'archived') NOT NULL DEFAULT 'draft',
  min_gpa DECIMAL(4,2) NOT NULL DEFAULT 1.00,
  created_by_admin_id INT UNSIGNED NOT NULL,
  published_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_scholarships_status_deadline (status, deadline),
  KEY idx_scholarships_admin_created (created_by_admin_id, created_at),
  CONSTRAINT fk_scholarships_admin FOREIGN KEY (created_by_admin_id) REFERENCES admins(admin_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_scholarships_min_gpa_range CHECK (min_gpa >= 1.00 AND min_gpa <= 5.00)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS applications (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  student_id VARCHAR(50) NOT NULL,
  scholarship_id INT UNSIGNED NOT NULL,
  gpa DECIMAL(4,2) NOT NULL,
  status ENUM('Submitted', 'Pending', 'Eligible', 'Under Review', 'Approved', 'Rejected', 'Withdrawn') NOT NULL DEFAULT 'Submitted',
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  reviewed_at DATETIME NULL,
  reviewed_by_admin_id INT UNSIGNED NULL,
  decision_notes VARCHAR(500) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_applications_student_scholarship (student_id, scholarship_id),
  KEY idx_applications_status (status),
  KEY idx_applications_applied_at (applied_at),
  KEY idx_applications_reviewed_by (reviewed_by_admin_id),
  CONSTRAINT fk_applications_student FOREIGN KEY (student_id) REFERENCES students(student_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_applications_scholarship FOREIGN KEY (scholarship_id) REFERENCES scholarships(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_applications_reviewed_by_admin FOREIGN KEY (reviewed_by_admin_id) REFERENCES admins(admin_id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT chk_applications_gpa_range CHECK (gpa >= 1.00 AND gpa <= 5.00)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS application_details (
  application_id INT UNSIGNED NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  date_of_birth DATE NULL,
  address TEXT NULL,
  contact_number VARCHAR(30) NULL,
  email VARCHAR(255) NULL,
  course_program VARCHAR(150) NULL,
  year_level TINYINT UNSIGNED NULL,
  gwa DECIMAL(4,2) NULL,
  learner_reference_number VARCHAR(60) NULL,
  family_income DECIMAL(12,2) NULL,
  parent_occupation VARCHAR(150) NULL,
  special_membership ENUM('none', 'indigenous', 'pwd', 'solo_parent') NOT NULL DEFAULT 'none',
  letter_of_intent TEXT NULL,
  submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (application_id),
  CONSTRAINT fk_application_details_application FOREIGN KEY (application_id) REFERENCES applications(id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT chk_application_details_gwa_range CHECK (gwa IS NULL OR (gwa >= 1.00 AND gwa <= 5.00))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS document_types (
  document_type_id TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(40) NOT NULL,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(255) NULL,
  allowed_extensions VARCHAR(120) NULL,
  is_required TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (document_type_id),
  UNIQUE KEY uq_document_types_code (code)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS student_documents (
  document_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  student_id VARCHAR(50) NOT NULL,
  application_id INT UNSIGNED NULL,
  document_type_id TINYINT UNSIGNED NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  storage_path VARCHAR(500) NOT NULL,
  mime_type VARCHAR(120) NULL,
  file_size_bytes BIGINT UNSIGNED NULL,
  sha256_hash CHAR(64) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (document_id),
  KEY idx_student_documents_student_uploaded (student_id, uploaded_at),
  KEY idx_student_documents_application (application_id),
  KEY idx_student_documents_type (document_type_id),
  CONSTRAINT fk_student_documents_student FOREIGN KEY (student_id) REFERENCES students(student_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_student_documents_application FOREIGN KEY (application_id) REFERENCES applications(id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_student_documents_type FOREIGN KEY (document_type_id) REFERENCES document_types(document_type_id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS application_status_history (
  history_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  application_id INT UNSIGNED NOT NULL,
  old_status ENUM('Submitted', 'Pending', 'Eligible', 'Under Review', 'Approved', 'Rejected', 'Withdrawn') NULL,
  new_status ENUM('Submitted', 'Pending', 'Eligible', 'Under Review', 'Approved', 'Rejected', 'Withdrawn') NOT NULL,
  changed_by_admin_id INT UNSIGNED NULL,
  change_note VARCHAR(500) NULL,
  changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (history_id),
  KEY idx_status_history_application_changed (application_id, changed_at),
  CONSTRAINT fk_status_history_application FOREIGN KEY (application_id) REFERENCES applications(id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_status_history_admin FOREIGN KEY (changed_by_admin_id) REFERENCES admins(admin_id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notifications (
  notification_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  recipient_account_id BIGINT UNSIGNED NOT NULL,
  recipient_role ENUM('student', 'admin') NOT NULL,
  notification_type ENUM('NEW_SCHOLARSHIP', 'DEADLINE_APPROACHING', 'NEW_APPLICATION', 'APPLICATION_STATUS') NOT NULL,
  title VARCHAR(180) NOT NULL,
  message VARCHAR(500) NOT NULL,
  reference_type ENUM('scholarship', 'application', 'system') NOT NULL DEFAULT 'system',
  reference_id BIGINT UNSIGNED NULL,
  notification_key VARCHAR(191) NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at DATETIME NULL,
  PRIMARY KEY (notification_id),
  UNIQUE KEY uq_notifications_recipient_key (recipient_account_id, notification_key),
  KEY idx_notifications_recipient_read_created (recipient_account_id, is_read, created_at),
  CONSTRAINT fk_notifications_recipient_account FOREIGN KEY (recipient_account_id) REFERENCES auth_accounts(account_id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

-- -------------------------------------------------------------
-- Seed lookup rows and baseline protected accounts
-- -------------------------------------------------------------
INSERT INTO document_types (code, name, description, allowed_extensions, is_required)
VALUES
  ('identity', 'Proof of Identity', 'PSA Birth Certificate or valid ID', 'pdf,jpg,jpeg,png', 1),
  ('academic', 'Academic Proof', 'Form 138 / TOR', 'pdf', 1),
  ('enrollment', 'Enrollment Proof', 'Certificate of Enrollment or Registration Form', 'pdf', 1),
  ('income', 'Proof of Income', 'ITR / Tax Exemption / Indigency', 'pdf,jpg,jpeg,png', 1),
  ('character', 'Character Reference', 'Certificate of Good Moral', 'pdf', 1),
  ('photo', 'Recent Photo', '2x2 ID Picture', 'jpg,jpeg,png', 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  allowed_extensions = VALUES(allowed_extensions),
  is_required = VALUES(is_required);

-- Baseline admin profile (created only if missing)
INSERT INTO admins (admin_id, full_name, email)
SELECT 1, 'Portal Administrator', 'admin@scholarship.local'
WHERE NOT EXISTS (
  SELECT 1 FROM admins WHERE admin_id = 1
);

-- Baseline protected admin login account
-- password_hash below is a placeholder bcrypt hash. Replace with your own secure hash in production.
INSERT INTO auth_accounts (role, admin_id, username, email, password_hash, is_active, is_protected)
SELECT 'admin', 1, 'admin', 'admin@scholarship.local', '$2b$10$2lc6M9a.gX6y9Va8AQW3UeEJiQe3J3x2fQeF2Xv2oDcxq5oM1FZ4y', 1, 1
WHERE NOT EXISTS (
  SELECT 1 FROM auth_accounts WHERE role = 'admin' AND username = 'admin'
);

-- Baseline protected student profile/account for quick testing (optional but helpful)
INSERT INTO students (student_id, name, email, program, year_level, gpa)
SELECT 'S-0001', 'Sample Student', 'student1@scholarship.local', 'BS Information Technology', 2, 1.75
WHERE NOT EXISTS (
  SELECT 1 FROM students WHERE student_id = 'S-0001'
);

INSERT INTO auth_accounts (role, student_id, username, email, password_hash, is_active, is_protected)
SELECT 'student', 'S-0001', 'S-0001', 'student1@scholarship.local', '$2b$10$3mY7wqf8mDlp0xRb0Bf0Iu7QPtAxeLfTsxJbt4ow3Q8ht7eA5msZe', 1, 1
WHERE NOT EXISTS (
  SELECT 1 FROM auth_accounts WHERE role = 'student' AND student_id = 'S-0001'
);

-- -------------------------------------------------------------
-- Triggers
-- -------------------------------------------------------------
DELIMITER //

CREATE TRIGGER trg_auth_accounts_before_delete_protected
BEFORE DELETE ON auth_accounts
FOR EACH ROW
BEGIN
  IF OLD.is_protected = 1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Protected auth account cannot be deleted.';
  END IF;
END //

CREATE TRIGGER trg_scholarships_before_insert_publish
BEFORE INSERT ON scholarships
FOR EACH ROW
BEGIN
  IF NEW.status = 'published' AND NEW.published_at IS NULL THEN
    SET NEW.published_at = NOW();
  END IF;
END //

CREATE TRIGGER trg_scholarships_before_update_publish
BEFORE UPDATE ON scholarships
FOR EACH ROW
BEGIN
  IF OLD.status <> 'published' AND NEW.status = 'published' AND NEW.published_at IS NULL THEN
    SET NEW.published_at = NOW();
  END IF;

  IF NEW.status = 'closed' AND OLD.status <> 'closed' THEN
    IF NEW.deadline > CURDATE() THEN
      SET NEW.deadline = CURDATE();
    END IF;
  END IF;
END //

CREATE TRIGGER trg_scholarships_after_insert_notify_students
AFTER INSERT ON scholarships
FOR EACH ROW
BEGIN
  IF NEW.status = 'published' THEN
    INSERT IGNORE INTO notifications (
      recipient_account_id,
      recipient_role,
      notification_type,
      title,
      message,
      reference_type,
      reference_id,
      notification_key
    )
    SELECT
      aa.account_id,
      'student',
      'NEW_SCHOLARSHIP',
      CONCAT('New Scholarship: ', NEW.title),
      CONCAT('A new scholarship has been published. Deadline: ', DATE_FORMAT(NEW.deadline, '%b %d, %Y')),
      'scholarship',
      NEW.id,
      CONCAT('new_scholarship:', NEW.id)
    FROM auth_accounts aa
    WHERE aa.role = 'student' AND aa.is_active = 1;
  END IF;
END //

CREATE TRIGGER trg_scholarships_after_update_notify_students
AFTER UPDATE ON scholarships
FOR EACH ROW
BEGIN
  IF OLD.status <> 'published' AND NEW.status = 'published' THEN
    INSERT IGNORE INTO notifications (
      recipient_account_id,
      recipient_role,
      notification_type,
      title,
      message,
      reference_type,
      reference_id,
      notification_key
    )
    SELECT
      aa.account_id,
      'student',
      'NEW_SCHOLARSHIP',
      CONCAT('New Scholarship: ', NEW.title),
      CONCAT('A new scholarship has been published. Deadline: ', DATE_FORMAT(NEW.deadline, '%b %d, %Y')),
      'scholarship',
      NEW.id,
      CONCAT('new_scholarship:', NEW.id)
    FROM auth_accounts aa
    WHERE aa.role = 'student' AND aa.is_active = 1;
  END IF;
END //

CREATE TRIGGER trg_applications_after_insert
AFTER INSERT ON applications
FOR EACH ROW
BEGIN
  -- Initial status history row
  INSERT INTO application_status_history (
    application_id,
    old_status,
    new_status,
    changed_by_admin_id,
    change_note
  ) VALUES (
    NEW.id,
    NULL,
    NEW.status,
    NULL,
    'Initial application submission'
  );

  -- Notify all active admins about new submission
  INSERT IGNORE INTO notifications (
    recipient_account_id,
    recipient_role,
    notification_type,
    title,
    message,
    reference_type,
    reference_id,
    notification_key
  )
  SELECT
    aa.account_id,
    'admin',
    'NEW_APPLICATION',
    CONCAT('New Application #', NEW.id),
    CONCAT('A new scholarship application was submitted by student ', NEW.student_id, '.'),
    'application',
    NEW.id,
    CONCAT('new_application:', NEW.id)
  FROM auth_accounts aa
  WHERE aa.role = 'admin' AND aa.is_active = 1;
END //

CREATE TRIGGER trg_applications_after_update
AFTER UPDATE ON applications
FOR EACH ROW
BEGIN
  IF OLD.status <> NEW.status THEN
    INSERT INTO application_status_history (
      application_id,
      old_status,
      new_status,
      changed_by_admin_id,
      change_note
    ) VALUES (
      NEW.id,
      OLD.status,
      NEW.status,
      NEW.reviewed_by_admin_id,
      NEW.decision_notes
    );

    -- Notify student when status changes
    INSERT IGNORE INTO notifications (
      recipient_account_id,
      recipient_role,
      notification_type,
      title,
      message,
      reference_type,
      reference_id,
      notification_key
    )
    SELECT
      aa.account_id,
      'student',
      'APPLICATION_STATUS',
      CONCAT('Application #', NEW.id, ' Update'),
      CONCAT('Your application status is now: ', NEW.status, '.'),
      'application',
      NEW.id,
      CONCAT('application_status:', NEW.id, ':', DATE_FORMAT(NOW(6), '%Y%m%d%H%i%s%f'))
    FROM auth_accounts aa
    WHERE aa.role = 'student' AND aa.student_id = NEW.student_id
    LIMIT 1;
  END IF;
END //

DELIMITER ;

-- -------------------------------------------------------------
-- Procedures
-- -------------------------------------------------------------
DELIMITER //

CREATE PROCEDURE sp_generate_deadline_notifications(IN p_days_before INT)
BEGIN
  -- Notify students
  INSERT IGNORE INTO notifications (
    recipient_account_id,
    recipient_role,
    notification_type,
    title,
    message,
    reference_type,
    reference_id,
    notification_key
  )
  SELECT
    aa.account_id,
    'student',
    'DEADLINE_APPROACHING',
    CONCAT('Deadline Reminder: ', s.title),
    CONCAT('The scholarship "', s.title, '" closes in ', p_days_before, ' day(s) on ', DATE_FORMAT(s.deadline, '%b %d, %Y'), '.'),
    'scholarship',
    s.id,
    CONCAT('deadline:student:', s.id, ':', p_days_before)
  FROM scholarships s
  JOIN auth_accounts aa
    ON aa.role = 'student' AND aa.is_active = 1
  WHERE s.status = 'published'
    AND DATEDIFF(s.deadline, CURDATE()) = p_days_before;

  -- Notify admins
  INSERT IGNORE INTO notifications (
    recipient_account_id,
    recipient_role,
    notification_type,
    title,
    message,
    reference_type,
    reference_id,
    notification_key
  )
  SELECT
    aa.account_id,
    'admin',
    'DEADLINE_APPROACHING',
    CONCAT('Deadline Reminder: ', s.title),
    CONCAT('Scholarship "', s.title, '" closes in ', p_days_before, ' day(s) on ', DATE_FORMAT(s.deadline, '%b %d, %Y'), '.'),
    'scholarship',
    s.id,
    CONCAT('deadline:admin:', s.id, ':', p_days_before)
  FROM scholarships s
  JOIN auth_accounts aa
    ON aa.role = 'admin' AND aa.is_active = 1
  WHERE s.status = 'published'
    AND DATEDIFF(s.deadline, CURDATE()) = p_days_before;
END //

CREATE PROCEDURE sp_clear_test_data_keep_accounts()
BEGIN
  -- Clears operational data while preserving auth/student/admin accounts.
  DELETE FROM notifications;
  DELETE FROM application_status_history;
  DELETE FROM student_documents;
  DELETE FROM application_details;
  DELETE FROM applications;
  DELETE FROM scholarships;

  ALTER TABLE notifications AUTO_INCREMENT = 1;
  ALTER TABLE application_status_history AUTO_INCREMENT = 1;
  ALTER TABLE student_documents AUTO_INCREMENT = 1;
  ALTER TABLE applications AUTO_INCREMENT = 1;
  ALTER TABLE scholarships AUTO_INCREMENT = 1;
END //

DELIMITER ;

-- -------------------------------------------------------------
-- Optional scheduled event for deadline reminders
-- -------------------------------------------------------------
-- If needed, enable scheduler manually (requires privileges):
-- SET GLOBAL event_scheduler = ON;

DELIMITER //

CREATE EVENT ev_daily_deadline_notifications
ON SCHEDULE EVERY 1 DAY
STARTS (CURRENT_DATE + INTERVAL 1 DAY + INTERVAL 8 HOUR)
DO
BEGIN
  CALL sp_generate_deadline_notifications(7);
  CALL sp_generate_deadline_notifications(3);
  CALL sp_generate_deadline_notifications(1);
END //

DELIMITER ;

-- -------------------------------------------------------------
-- Views for Student Portal + Admin Portal features
-- -------------------------------------------------------------
CREATE VIEW vw_browse_scholarships AS
SELECT
  s.id AS scholarship_id,
  s.title,
  s.description,
  s.deadline,
  s.status,
  s.min_gpa,
  s.published_at
FROM scholarships s
WHERE s.status = 'published'
  AND s.deadline >= CURDATE();

CREATE VIEW vw_student_application_list AS
SELECT
  a.id AS application_id,
  a.student_id,
  s.title AS scholarship_title,
  a.status,
  a.applied_at,
  a.updated_at AS last_update
FROM applications a
JOIN scholarships s ON s.id = a.scholarship_id;

CREATE VIEW vw_student_tracker_summary AS
SELECT
  a.student_id,
  COUNT(*) AS total_applications,
  SUM(CASE WHEN a.status IN ('Submitted', 'Pending', 'Eligible', 'Under Review') THEN 1 ELSE 0 END) AS under_review,
  SUM(CASE WHEN a.status = 'Approved' THEN 1 ELSE 0 END) AS approved,
  SUM(CASE WHEN a.status = 'Rejected' THEN 1 ELSE 0 END) AS rejected,
  MAX(a.updated_at) AS last_update
FROM applications a
GROUP BY a.student_id;

CREATE VIEW vw_admin_review_queue AS
SELECT
  a.id AS application_id,
  a.student_id,
  st.name AS student_name,
  st.program,
  st.year_level,
  s.id AS scholarship_id,
  s.title AS scholarship_title,
  a.gpa,
  a.status,
  a.applied_at,
  a.updated_at,
  COUNT(sd.document_id) AS submitted_document_count
FROM applications a
JOIN students st ON st.student_id = a.student_id
JOIN scholarships s ON s.id = a.scholarship_id
LEFT JOIN student_documents sd ON sd.application_id = a.id AND sd.is_active = 1
GROUP BY
  a.id,
  a.student_id,
  st.name,
  st.program,
  st.year_level,
  s.id,
  s.title,
  a.gpa,
  a.status,
  a.applied_at,
  a.updated_at;

CREATE VIEW vw_admin_application_status_summary AS
SELECT
  CASE
    WHEN a.status IN ('Submitted', 'Pending', 'Eligible', 'Under Review') THEN 'Pending Review'
    WHEN a.status = 'Approved' THEN 'Approved'
    WHEN a.status = 'Rejected' THEN 'Rejected'
    ELSE 'Other'
  END AS status_bucket,
  COUNT(*) AS total_count
FROM applications a
GROUP BY
  CASE
    WHEN a.status IN ('Submitted', 'Pending', 'Eligible', 'Under Review') THEN 'Pending Review'
    WHEN a.status = 'Approved' THEN 'Approved'
    WHEN a.status = 'Rejected' THEN 'Rejected'
    ELSE 'Other'
  END;

CREATE VIEW vw_admin_dashboard_metrics AS
SELECT
  (SELECT COUNT(DISTINCT student_id) FROM applications) AS total_applicants,
  (SELECT COUNT(*) FROM scholarships WHERE status = 'published') AS scholarships,
  (SELECT COUNT(*) FROM applications WHERE status IN ('Submitted', 'Pending', 'Eligible', 'Under Review')) AS pending_review,
  (SELECT COUNT(*) FROM applications WHERE status = 'Approved') AS approved,
  (SELECT COUNT(*) FROM applications WHERE status = 'Rejected') AS rejected,
  NOW() AS generated_at;

-- =============================================================
-- End of complete_portal_database.sql
-- =============================================================
