const express = require('express');
const router = express.Router();
const appController = require('../controllers/applicationController');

router.get('/', appController.getAllApplications);
router.post('/apply', appController.submitApplicationWithTransaction);
router.post('/rank', appController.runAutomatedRanking);
router.delete('/:id', appController.deleteApplication);

module.exports = router;
