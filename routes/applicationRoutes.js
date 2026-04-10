const express = require('express');
const router = express.Router();
const appController = require('../controllers/applicationController');

router.get('/', appController.getAllApplications);
router.post('/apply', appController.submitApplicationWithTransaction);
router.put('/:id/status', appController.updateApplicationStatus);
router.get('/scholarships', appController.getScholarships);
router.get('/student/:student_id', appController.getStudentApplications);
module.exports = router;
