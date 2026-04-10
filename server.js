require('dotenv').config();
const express = require('express');
const app = express();
const path = require('path');
const applicationRoutes = require('./routes/applicationRoutes');

// Middleware to parse JSON bodies
app.use(express.json());

// Serve static frontend files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// API Routes mounting
app.use('/api/applications', applicationRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running securely on port ${PORT}`);
    console.log(`Visit http://localhost:${PORT} in your browser to view the application.`);
});
