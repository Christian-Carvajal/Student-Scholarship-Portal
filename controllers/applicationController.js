// In-memory data to replace MySQL for now
let students = [
    { student_id: 1, first_name: 'Alice', last_name: 'Smith', email: 'alice@example.com', gpa: 3.85, major: 'Computer Science' },
    { student_id: 2, first_name: 'Bob', last_name: 'Jones', email: 'bob@example.com', gpa: 2.90, major: 'Business' }
];

let scholarships = [
    { scholarship_id: 1, name: 'Engineering Excellence Fund', fund_amount: 5000.00, min_gpa: 3.50 },
    { scholarship_id: 2, name: 'General Merit Scholarship', fund_amount: 2000.00, min_gpa: 3.00 }
];

let applications = [
    { application_id: 1, student_id: 1, scholarship_id: 1, status: 'Pending', score: 0 },
    { application_id: 2, student_id: 1, scholarship_id: 2, status: 'Pending', score: 0 }
];

let studentIdCounter = 3;
let appIdCounter = 3;

/**
 * Mocking a SQL Transaction logic:
 * Creates a new student AND their scholarship application in memory.
 */
exports.submitApplicationWithTransaction = async (req, res) => {
    const { firstName, lastName, email, gpa, major, scholarshipId } = req.body;
    
    try {
        // 1. Insert Student
        const newStudentId = studentIdCounter++;
        students.push({
            student_id: newStudentId,
            first_name: firstName,
            last_name: lastName,
            email: email,
            gpa: parseFloat(gpa),
            major: major
        });

        // 2. Insert Application mapping the new student to the scholarship
        applications.push({
            application_id: appIdCounter++,
            student_id: newStudentId,
            scholarship_id: parseInt(scholarshipId, 10),
            status: 'Pending',
            score: 0
        });

        res.status(201).json({ message: 'Application submitted successfully!', studentId: newStudentId });
    } catch (error) {
        console.error('Transaction failed:', error);
        res.status(500).json({ error: 'Failed to submit application.' });
    }
};

/**
 * Automated Ranking Algorithm
 */
exports.runAutomatedRanking = async (req, res) => {
    try {
        applications.forEach(app => {
            if (app.status === 'Pending') {
                const student = students.find(s => s.student_id === app.student_id);
                const scholarship = scholarships.find(sch => sch.scholarship_id === app.scholarship_id);
                
                if (student && scholarship) {
                    if (parseFloat(student.gpa) < parseFloat(scholarship.min_gpa)) {
                        app.status = 'Rejected';
                    } else {
                        app.status = 'Under Review';
                        app.score = Math.round(parseFloat(student.gpa) * 100);
                    }
                }
            }
        });

        res.status(200).json({ message: 'Automated ranking and vetting complete.' });
    } catch (error) {
        console.error('Error running ranking algorithm:', error);
        res.status(500).json({ error: 'Failed to run ranking algorithm.' });
    }
};

/**
 * Standard CRUD: Read All Applications
 */
exports.getAllApplications = async (req, res) => {
    try {
        const rows = applications.map(app => {
            const student = students.find(s => s.student_id === app.student_id) || {};
            const scholarship = scholarships.find(sch => sch.scholarship_id === app.scholarship_id) || {};
            
            return {
                application_id: app.application_id,
                first_name: student.first_name,
                last_name: student.last_name,
                scholarship_name: scholarship.name,
                status: app.status,
                score: app.score
            };
        });

        // Sort by score descending
        rows.sort((a, b) => b.score - a.score);
        
        res.status(200).json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve applications.' });
    }
};

/**
 * Standard CRUD: Delete Application
 */
exports.deleteApplication = async (req, res) => {
    try {
        const { id } = req.params;
        applications = applications.filter(app => app.application_id !== parseInt(id, 10));
        res.status(200).json({ message: 'Application deleted successfully.' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete application.' });
    }
};
