# Student Scholarship Portal - Capstone Project

Welcome to the development repository for the **Student Scholarship Portal** (UPHSD Theme). This document serves as the central hub for our team to understand the system architecture, current development progress, pending tasks, and the complete database integration plan.

---

## 🚀 Quick Start (Running the App)

Currently, the application is running using an **in-memory mock database** so the UI can be tested without needing a running MySQL instance.

1. Ensure you have [Node.js](https://nodejs.org/) installed.
2. Open your terminal in the project directory (`/DBM_Project`).
3. Install the dependencies:
   ```bash
   npm install
   ```
4. Start the server:
   ```bash
   node server.js
   ```
5. Open your browser and navigate to: `http://localhost:3000`

> **Test Account:** You can sign in right away using Student ID: `12345` and Password: `password123`.

---

## 📋 Task Tracker

### ✅ Finished (Frontend & Mock Backend)
- **Node.js/Express Server Initialization**: `server.js` and routing architecture is complete.
- **Frontend SPA Shell**: Built inside `/public/index.html` with Vanilla JS DOM routing (`/public/js/app.js`).
- **UPHSD Branding**: Custom CSS variables for Maroon (`#7a1114`) and Gold (`#fdbb11`) applied in `style.css`.
- **Global Modal System**: Browser alerts are disabled. We now use a custom windowed modal (`#customModal`) for all alerts, confirmations, and displaying the auto-generated password on registration.
- **Mock Authentication Flow**: Registration generates a password, saves it to a mock array, and Login authenticates against it.
- **Mock Data Rendering**: The UI successfully loops through mock JSON data to populate the Scholarship Cards, Student Tracker Table, and Admin Dashboard.

### 🚧 Unfinished (To-Do for Backend/Database Team)
These are the core tasks remaining to transition the app from "Mock Data" to a "Production" state:
- **[ ] Setup MySQL Connection**: Configure `config/db.js` using the `mysql2/promise` package.
- **[ ] Execute the DDL**: Create the physical MySQL database using the SQL script provided below.
- **[ ] Replace Controllers**: Open `controllers/applicationController.js` and replace the array logic (`students.push()`, etc.) with actual SQL `INSERT`, `SELECT`, `UPDATE`, and `DELETE` statements.
- **[ ] Implement SQL Transactions**: Ensure the "Submit Application" route uses a transactional connection to insert a user and their application simultaneously, rolling back if either fails.
- **[ ] Real Authentication (Security)**: Replace the plain text mock passwords with `bcrypt` hashing and implement a real `session` or JWT-based auth guard for the API routes.
- **[ ] File Uploads**: Implement a library like `multer` to actually save the uploaded PDF/Image files to the server and store their file paths in the database.

---

## 🗄️ Database Architecture (Strict 3NF)

Below is the **Data Definition Language (DDL)** to be executed by the database team. It establishes a 3rd Normal Form (3NF) relational database for our portal.

**Note to DB Devs:** You can paste this entire script into your MySQL Workbench or PHPMyAdmin to set up the database and insert dummy data to test the endpoints.

```sql
-- Create Database
CREATE DATABASE IF NOT EXISTS scholarship_portal;
USE scholarship_portal;

-- 1. Students Table
-- Stores candidate details. GPA is stored as a DECIMAL for precise ranking.
CREATE TABLE IF NOT EXISTS Students (
    student_id INT AUTO_INCREMENT PRIMARY KEY,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL, -- Added for real auth later
    gpa DECIMAL(3, 2) NOT NULL CHECK (gpa >= 0.00 AND gpa <= 4.00),
    major VARCHAR(100) NOT NULL,
    year_level INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Scholarships Table
-- Stores available scholarships and their minimum requirements.
CREATE TABLE IF NOT EXISTS Scholarships (
    scholarship_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    fund_amount DECIMAL(10, 2) NOT NULL,
    min_gpa DECIMAL(3, 2) NOT NULL,
    deadline DATE NOT NULL,
    type VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Applications Table (Junction Table for M:N relationship)
-- 3NF compliant: depends entirely on the composite of student and scholarship.
CREATE TABLE IF NOT EXISTS Applications (
    application_id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL,
    scholarship_id INT NOT NULL,
    status ENUM('Pending', 'Under Review', 'Approved', 'Rejected') DEFAULT 'Pending',
    score INT DEFAULT 0, -- Used for automated ranking
    transcript_path VARCHAR(255),
    id_path VARCHAR(255),
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES Students(student_id) ON DELETE CASCADE,
    FOREIGN KEY (scholarship_id) REFERENCES Scholarships(scholarship_id) ON DELETE CASCADE,
    UNIQUE(student_id, scholarship_id) -- Prevent duplicate applications
);

-- ==========================================
-- Sample DML (Dummy Data for initial testing)
-- ==========================================

INSERT INTO Scholarships (name, description, fund_amount, min_gpa, deadline, type) VALUES 
('Engineering Excellence Fund', 'For top engineering students.', 15000.00, 3.00, '2026-06-15', 'Program-Specific'),
('UPHSD Gold Tier Merit', 'Highest honor for maintaining a 3.8+ GPA.', 25000.00, 3.80, '2026-05-30', 'Merit');

INSERT INTO Students (first_name, last_name, email, password_hash, gpa, major, year_level) VALUES 
('Alice', 'Smith', 'alice@example.com', 'mockhash123', 3.85, 'Computer Science', 3),
('Bob', 'Jones', 'bob@example.com', 'mockhash456', 2.90, 'Business', 2);

INSERT INTO Applications (student_id, scholarship_id, status) VALUES 
(1, 2, 'Under Review'),
(2, 1, 'Rejected');
```

---

## 📁 Directory Structure Guide

```text
c:\DBM_Project\
├── config/
│   └── db.js                 <-- Create this to connect to MySQL! (To-Do)
├── controllers/
│   └── applicationController.js <-- API logic (Currently uses Array mocks. Replace with SQL)
├── routes/
│   └── applicationRoutes.js  <-- Express REST mappings
├── public/                   <-- ALL FRONTEND CODE IS HERE
│   ├── index.html            <-- Semantic UI & Custom Modals
│   ├── style.css             <-- UPHSD Theme CSS
│   └── js/
│       └── app.js            <-- SPA Routing & DOM Manipulation
├── package.json              <-- Node dependencies
├── server.js                 <-- Express application entry point
└── README.md                 <-- You are here
```
