const db = require('../config/db');

/**
 * 1. Submit Application (Auto-Vetting logic applied instantly)
 */
exports.submitApplicationWithTransaction = async (req, res) => {
    const { student_id, name, program, year_level, gpa, scholarship_id } = req.body;
    
    // Acquire a connection for transaction
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();

        // Check if student exists, and update/insert
        const [existingStudent] = await connection.query(
            'SELECT * FROM students WHERE student_id = ?', 
            [student_id]
        );
        
        if (existingStudent.length === 0) {
            await connection.query(
                'INSERT INTO students (student_id, name, program, year_level, gpa) VALUES (?, ?, ?, ?, ?)',
                [student_id, name, program, year_level, parseFloat(gpa)]
            );
        } else {
            // Update student GPA in case it changed
            await connection.query(
                'UPDATE students SET name=?, program=?, year_level=?, gpa=? WHERE student_id=?',
                [name, program, year_level, parseFloat(gpa), student_id]
            );
        }

        // Get scholarship details for auto-vetting
        const [scholarships] = await connection.query(
            'SELECT min_gpa FROM scholarships WHERE id = ?', 
            [scholarship_id]
        );
        
        if (scholarships.length === 0) {
            throw new Error('Scholarship not found');
        }
        
        let min_gpa = parseFloat(scholarships[0].min_gpa);
        let studentGpa = parseFloat(gpa);
        
        // Auto-Vetting Engine ⚙️
        let status = 'Pending';
        if (studentGpa < min_gpa) {
            status = 'Rejected'; // Fails minimum requirement instantly
        } else {
            status = 'Eligible'; // Meets or exceeds minimum requirement
        }

        // Insert Application with resulting status
        await connection.query(
            'INSERT INTO applications (student_id, scholarship_id, gpa, status) VALUES (?, ?, ?, ?)',
            [student_id, scholarship_id, studentGpa, status]
        );

        await connection.commit();
        res.status(201).json({ message: 'Application submitted successfully!', status: status });
    } catch (error) {
        await connection.rollback();
        console.error('Transaction failed:', error);
        res.status(500).json({ error: 'Failed to submit application.' });
    } finally {
        connection.release();
    }
};

/**
 * 2. Get Auto-Ranked Leaderboard for Admin (Ranking Engine 📊)
 */
exports.getAllApplications = async (req, res) => {
    try {
        // Advanced Ranking Query:
        // Get all applications, join with students and scholarships.
        // Order strictly by status='Eligible' first, then GPA descending, then year level descending.
        const [rows] = await db.query(`
            SELECT 
                a.id as application_id, 
                s.name as student_name, 
                s.student_id,
                s.year_level,
                sch.title as scholarship_title, 
                a.gpa as submitted_gpa,
                sch.min_gpa,
                a.status,
                a.applied_at
            FROM applications a
            JOIN students s ON a.student_id = s.student_id
            JOIN scholarships sch ON a.scholarship_id = sch.id
            ORDER BY 
                CASE a.status
                    WHEN 'Approved' THEN 1
                    WHEN 'Eligible' THEN 2
                    WHEN 'Pending' THEN 3
                    WHEN 'Rejected' THEN 4
                    ELSE 5
                END ASC,
                a.gpa DESC,
                s.year_level DESC
        `);

        res.status(200).json(rows);
    } catch (error) {
        console.error('Failed to fetch leaderboard:', error);
        res.status(500).json({ error: 'Failed to retrieve applications.' });
    }
};

/**
 * 3. Update Application Status (Manual Admin Approval)
 */
exports.updateApplicationStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        await db.query(
            'UPDATE applications SET status = ? WHERE id = ?',
            [status, id]
        );
        res.status(200).json({ message: 'Application updated successfully.', status: status });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update application status.' });
    }
};

/**
 * 4. Get Scholarships for the frontend dropdowns
 */
exports.getScholarships = async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM scholarships');
        res.status(200).json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve scholarships.' });
    }
};

/**
 * 5. Get Student Tracker (Specific student's applications)
 */
exports.getStudentApplications = async (req, res) => {
    try {
        const { student_id } = req.params;
        const [rows] = await db.query(`
            SELECT 
                a.id as application_id, 
                sch.title as scholarship_title,
                a.status,
                a.applied_at
            FROM applications a
            JOIN scholarships sch ON a.scholarship_id = sch.id
            WHERE a.student_id = ?
            ORDER BY a.applied_at DESC
        `, [student_id]);
        
        res.status(200).json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve your applications.' });
    }
};
