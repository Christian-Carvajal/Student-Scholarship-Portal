const mysql = require('mysql2/promise');
require('dotenv').config();

async function setupDatabase() {
    try {
        console.log('Connecting to MySQL Server (XAMPP default)...');
        // Initial connection without targeting a specific database to create it
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || ''
        });

        console.log('Creating database scholarship_portal if it does not exist...');
        await connection.query('CREATE DATABASE IF NOT EXISTS scholarship_portal');
        
        console.log('Switching to scholarship_portal database...');
        await connection.query('USE scholarship_portal');

        console.log('Creating Students table...');
        await connection.query(`
            CREATE TABLE IF NOT EXISTS students (
                student_id VARCHAR(50) PRIMARY KEY,
                name VARCHAR(255),
                program VARCHAR(150),
                year_level VARCHAR(50),
                gpa DECIMAL(3,2)
            )
        `);

        console.log('Creating Scholarships table...');
        await connection.query(`
            CREATE TABLE IF NOT EXISTS scholarships (
                id INT AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                fund_amount DECIMAL(10,2),
                min_gpa DECIMAL(3,2),
                type VARCHAR(50)
            )
        `);

        console.log('Creating Applications table...');
        await connection.query(`
            CREATE TABLE IF NOT EXISTS applications (
                id INT AUTO_INCREMENT PRIMARY KEY,
                student_id VARCHAR(50),
                scholarship_id INT,
                gpa DECIMAL(3,2),
                status VARCHAR(50) DEFAULT 'Submitted',
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (student_id) REFERENCES students(student_id),
                FOREIGN KEY (scholarship_id) REFERENCES scholarships(id)
            )
        `);

        // Check if there are existing scholarships; if not, populate some samples
        const [rows] = await connection.query('SELECT COUNT(*) as count FROM scholarships');
        if (rows[0].count === 0) {
            console.log('Populating initial sample scholarships...');
            await connection.query(`
                INSERT INTO scholarships (title, description, fund_amount, min_gpa, type) VALUES 
                ('Engineering Excellence Merit', 'A rigorous merit fund specifically for high-performing engineering candidates.', 15000.00, 3.50, 'merit'),
                ('UPHSD President\\'s General Fund', 'A campus-wide foundation designed to assist qualified students via GPA assessment.', 10000.00, 2.75, 'need'),
                ('Alumni Foundation Grant', 'Generously provided by the UPHSD alumni association for exemplary junior and senior students.', 20000.00, 3.25, 'merit')
            `);
        }

        console.log('✅ Database setup completed successfully!');
        await connection.end();
        process.exit(0);

    } catch (error) {
        console.error('❌ Error setting up database:', error);
        process.exit(1);
    }
}

setupDatabase();