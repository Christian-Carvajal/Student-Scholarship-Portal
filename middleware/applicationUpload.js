const fs = require('fs');
const path = require('path');
const multer = require('multer');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'documents');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const DOCUMENT_UPLOAD_FIELDS = [
    { field: 'document_identity', inputId: 'fileIdentity', code: 'identity', name: 'Proof of Identity' },
    { field: 'document_academic', inputId: 'fileAcademic', code: 'academic', name: 'Academic Proof' },
    { field: 'document_enrollment', inputId: 'fileEnrollment', code: 'enrollment', name: 'Enrollment Proof' },
    { field: 'document_income', inputId: 'fileIncome', code: 'income', name: 'Proof of Income' },
    { field: 'document_character', inputId: 'fileMoral', code: 'character', name: 'Character Reference' },
    { field: 'document_photo', inputId: 'filePhoto', code: 'photo', name: 'Recent Photo' },
];

const ALLOWED_EXTENSIONS = {
    document_identity: new Set(['.pdf', '.jpg', '.jpeg', '.png']),
    document_academic: new Set(['.pdf']),
    document_enrollment: new Set(['.pdf']),
    document_income: new Set(['.pdf', '.jpg', '.jpeg', '.png']),
    document_character: new Set(['.pdf']),
    document_photo: new Set(['.jpg', '.jpeg', '.png']),
};

const ALLOWED_SINGLE_DOCUMENT_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png']);

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, UPLOAD_DIR);
    },
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase();
        const baseName = path
            .basename(file.originalname || 'document', ext)
            .replace(/[^a-zA-Z0-9_-]+/g, '_')
            .slice(0, 60) || 'document';

        cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${baseName}${ext}`);
    },
});

const upload = multer({
    storage,
    limits: {
        fileSize: 8 * 1024 * 1024,
    },
    fileFilter: (_req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase();
        const allowed = ALLOWED_EXTENSIONS[file.fieldname];

        if (!allowed) {
            cb(new Error('Unexpected document field.'));
            return;
        }

        if (!allowed.has(ext)) {
            cb(new Error(`Invalid file type for ${file.fieldname}.`));
            return;
        }

        cb(null, true);
    },
});

const singleDocumentUpload = multer({
    storage,
    limits: {
        fileSize: 8 * 1024 * 1024,
    },
    fileFilter: (_req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase();
        if (!ALLOWED_SINGLE_DOCUMENT_EXTENSIONS.has(ext)) {
            cb(new Error('Invalid file type. Allowed types: PDF, JPG, JPEG, PNG.'));
            return;
        }

        cb(null, true);
    },
});

const multerFields = DOCUMENT_UPLOAD_FIELDS.map((item) => ({ name: item.field, maxCount: 1 }));

function handleApplicationUploads(req, res, next) {
    upload.fields(multerFields)(req, res, (error) => {
        if (!error) {
            next();
            return;
        }

        const status = error instanceof multer.MulterError ? 400 : 400;
        res.status(status).json({ error: error.message || 'File upload failed.' });
    });
}

function handleSingleDocumentUpload(req, res, next) {
    singleDocumentUpload.single('document_file')(req, res, (error) => {
        if (!error) {
            next();
            return;
        }

        const status = error instanceof multer.MulterError ? 400 : 400;
        res.status(status).json({ error: error.message || 'File upload failed.' });
    });
}

module.exports = {
    handleApplicationUploads,
    handleSingleDocumentUpload,
    DOCUMENT_UPLOAD_FIELDS,
};
