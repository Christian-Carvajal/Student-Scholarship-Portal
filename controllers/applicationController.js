const fs = require('fs');
const path = require('path');
const db = require('../config/db');
const { DOCUMENT_UPLOAD_FIELDS } = require('../middleware/applicationUpload');

const SCHOLARSHIP_STATUSES = new Set(['draft', 'published', 'closed', 'archived']);
const APPLICATION_STATUSES = new Set(['Submitted', 'Pending', 'Eligible', 'Under Review', 'Approved', 'Rejected', 'Withdrawn']);
const DEFAULT_STUDENT_PASSWORD_HASH = '$2b$10$3mY7wqf8mDlp0xRb0Bf0Iu7QPtAxeLfTsxJbt4ow3Q8ht7eA5msZe';
const SCHOLARSHIP_MINIMUM_KEYS = ['min_gpa', 'min_gwa', 'minimum_gwa', 'required_gwa', 'required_gpa'];
const FINAL_APPLICATION_STATUSES = new Set(['approved', 'rejected', 'denied']);
const DOCUMENT_UPLOAD_META_BY_CODE = new Map(DOCUMENT_UPLOAD_FIELDS.map((entry) => [entry.code, entry]));
const REQUIRED_APPLICATION_DOCUMENT_COUNT = DOCUMENT_UPLOAD_FIELDS.length;
const DOCUMENT_ALLOWED_EXTENSIONS_BY_CODE = new Map([
    ['identity', new Set(['.pdf', '.jpg', '.jpeg', '.png'])],
    ['academic', new Set(['.pdf'])],
    ['enrollment', new Set(['.pdf'])],
    ['income', new Set(['.pdf', '.jpg', '.jpeg', '.png'])],
    ['character', new Set(['.pdf'])],
    ['photo', new Set(['.jpg', '.jpeg', '.png'])],
]);

class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

function parseFiniteNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeApplicationStatusValue(status) {
    return (status || '').toString().trim().toLowerCase();
}

function isApplicationEditableForDocumentChanges(status) {
    const normalized = normalizeApplicationStatusValue(status);
    return !FINAL_APPLICATION_STATUSES.has(normalized);
}

function getEffectiveApplicationStatus(status, documentCount) {
    const normalizedStatus = normalizeApplicationStatusValue(status);
    const safeCount = Number.isFinite(Number(documentCount)) ? Number(documentCount) : null;

    if (normalizedStatus === 'eligible' && safeCount !== null && safeCount < REQUIRED_APPLICATION_DOCUMENT_COUNT) {
        return 'Incomplete';
    }

    return (status || 'Pending').toString();
}

function getFirstExistingColumn(columns, candidates) {
    for (const key of candidates) {
        if (columns.has(key)) return key;
    }

    return null;
}

function getScholarshipMinimumFromPayload(payload) {
    for (const key of SCHOLARSHIP_MINIMUM_KEYS) {
        const parsed = Number(payload?.[key]);
        if (Number.isFinite(parsed)) return parsed;
    }

    return Number.NaN;
}

function getScholarshipMinimumFromRow(row) {
    for (const key of SCHOLARSHIP_MINIMUM_KEYS) {
        const parsed = Number(row?.[key]);
        if (Number.isFinite(parsed)) return parsed;
    }

    return null;
}

function normalizeScholarshipRows(rows) {
    if (!Array.isArray(rows)) return [];

    return rows.map((row) => {
        const normalized = { ...row };
        const minimum = getScholarshipMinimumFromRow(row);

        if (minimum !== null) {
            normalized.min_gpa = minimum;
        }

        return normalized;
    });
}

function toFileUrl(storagePath) {
    if (!storagePath) return null;

    const normalized = String(storagePath).replace(/\\/g, '/');
    if (normalized.startsWith('http://') || normalized.startsWith('https://')) return normalized;
    if (normalized.startsWith('/')) return normalized;

    const uploadsIndex = normalized.toLowerCase().lastIndexOf('/uploads/');
    if (uploadsIndex >= 0) {
        return normalized.slice(uploadsIndex);
    }

    return `/uploads/documents/${path.posix.basename(normalized)}`;
}

async function cleanupUploadedFiles(filesMap) {
    const items = getUploadedDocumentEntries(filesMap).map((entry) => entry.file.path).filter(Boolean);
    if (items.length === 0) return;

    await Promise.allSettled(items.map(async (target) => {
        try {
            await fs.promises.unlink(target);
        } catch {
            // Intentionally ignored: cleanup best-effort only.
        }
    }));
}

function buildInPlaceholders(values) {
    return values.map(() => '?').join(', ');
}

function toAbsoluteStoragePath(storagePath) {
    if (!storagePath) return null;

    const normalized = String(storagePath).replace(/\\/g, '/');
    if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
        return null;
    }

    const relativePath = normalized.startsWith('/') ? normalized.slice(1) : normalized;
    if (!relativePath) return null;

    return path.resolve(process.cwd(), relativePath);
}

async function cleanupStoredDocumentPaths(storagePaths) {
    const absolutePaths = Array.from(
        new Set(storagePaths.map((item) => toAbsoluteStoragePath(item)).filter(Boolean))
    );

    if (absolutePaths.length === 0) return;

    await Promise.allSettled(absolutePaths.map(async (target) => {
        try {
            await fs.promises.unlink(target);
        } catch {
            // Intentionally ignored: cleanup best-effort only.
        }
    }));
}

async function tableExists(connection, tableName) {
    const [rows] = await connection.query(
        `SELECT 1
         FROM INFORMATION_SCHEMA.TABLES
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = ?
         LIMIT 1`,
        [tableName]
    );
    return rows.length > 0;
}

async function getTableColumns(connection, tableName) {
    const [rows] = await connection.query(
        `SELECT COLUMN_NAME
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = ?`,
        [tableName]
    );

    return new Set(rows.map((row) => row.COLUMN_NAME));
}

async function triggerExists(connection, triggerName) {
    const [rows] = await connection.query(
        `SELECT 1
         FROM INFORMATION_SCHEMA.TRIGGERS
         WHERE TRIGGER_SCHEMA = DATABASE()
           AND TRIGGER_NAME = ?
         LIMIT 1`,
        [triggerName]
    );
    return rows.length > 0;
}

async function ensureStudentAuthAccount(connection, studentId, preferredEmail = null) {
    const normalizedStudentId = (studentId || '').toString().trim();
    if (!normalizedStudentId) {
        return null;
    }

    if (!(await tableExists(connection, 'auth_accounts'))) {
        return null;
    }

    const authColumns = await getTableColumns(connection, 'auth_accounts');
    if (!authColumns.has('role') || !authColumns.has('student_id')) {
        return null;
    }

    const [existingRows] = await connection.query(
        `SELECT account_id
         FROM auth_accounts
         WHERE role = 'student'
           AND student_id = ?
         LIMIT 1`,
        [normalizedStudentId]
    );

    if (existingRows.length > 0) {
        return Number(existingRows[0].account_id);
    }

    let email = (preferredEmail || '').toString().trim().toLowerCase();
    if (!email && (await tableExists(connection, 'students'))) {
        const studentColumns = await getTableColumns(connection, 'students');
        if (studentColumns.has('email')) {
            const [studentRows] = await connection.query(
                'SELECT email FROM students WHERE student_id = ? LIMIT 1',
                [normalizedStudentId]
            );
            email = (studentRows?.[0]?.email || '').toString().trim().toLowerCase();
        }
    }

    if (!email) {
        email = `${normalizedStudentId.toLowerCase()}@student.local`;
    }

    const fields = [];
    const values = [];

    if (authColumns.has('role')) {
        fields.push('role');
        values.push('student');
    }

    if (authColumns.has('student_id')) {
        fields.push('student_id');
        values.push(normalizedStudentId);
    }

    if (authColumns.has('username')) {
        fields.push('username');
        values.push(normalizedStudentId);
    }

    if (authColumns.has('email')) {
        fields.push('email');
        values.push(email);
    }

    if (authColumns.has('password_hash')) {
        fields.push('password_hash');
        values.push(DEFAULT_STUDENT_PASSWORD_HASH);
    }

    if (authColumns.has('is_active')) {
        fields.push('is_active');
        values.push(1);
    }

    if (authColumns.has('is_protected')) {
        fields.push('is_protected');
        values.push(0);
    }

    if (fields.length > 0) {
        const placeholders = fields.map(() => '?').join(', ');
        await connection.query(
            `INSERT IGNORE INTO auth_accounts (${fields.join(', ')}) VALUES (${placeholders})`,
            values
        );
    }

    const [createdRows] = await connection.query(
        `SELECT account_id
         FROM auth_accounts
         WHERE role = 'student'
           AND student_id = ?
         LIMIT 1`,
        [normalizedStudentId]
    );

    return createdRows.length > 0 ? Number(createdRows[0].account_id) : null;
}

async function ensureAllStudentAuthAccounts(connection) {
    if (!(await tableExists(connection, 'students'))) {
        return 0;
    }

    const [studentRows] = await connection.query('SELECT student_id, email FROM students');
    let provisioned = 0;

    for (const row of studentRows) {
        const accountId = await ensureStudentAuthAccount(connection, row.student_id, row.email);
        if (accountId) {
            provisioned += 1;
        }
    }

    return provisioned;
}

async function ensureAllAdminAuthAccounts(connection) {
    if (!(await tableExists(connection, 'admins'))) {
        return 0;
    }

    if (!(await tableExists(connection, 'auth_accounts'))) {
        return 0;
    }

    const authColumns = await getTableColumns(connection, 'auth_accounts');
    if (!authColumns.has('role') || !authColumns.has('admin_id')) {
        return 0;
    }

    const [adminRows] = await connection.query('SELECT admin_id FROM admins');
    let linkedCount = 0;

    for (const row of adminRows) {
        const adminId = Number(row?.admin_id);
        if (!Number.isInteger(adminId) || adminId <= 0) continue;

        const [existingRows] = await connection.query(
            `SELECT account_id
             FROM auth_accounts
             WHERE role = 'admin'
               AND admin_id = ?
             LIMIT 1`,
            [adminId]
        );

        if (existingRows.length > 0) {
            linkedCount += 1;
        }
    }

    return linkedCount;
}

async function ensureNotificationsTable(connection) {
    if (await tableExists(connection, 'notifications')) {
        return;
    }

    await connection.query(`
        CREATE TABLE IF NOT EXISTS notifications (
            notification_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            student_id VARCHAR(50) NULL,
            recipient_account_id BIGINT UNSIGNED NULL,
            recipient_role VARCHAR(20) NOT NULL DEFAULT 'student',
            notification_type VARCHAR(60) NOT NULL,
            title VARCHAR(180) NOT NULL,
            message VARCHAR(500) NOT NULL,
            reference_type VARCHAR(40) NOT NULL DEFAULT 'system',
            reference_id BIGINT UNSIGNED NULL,
            notification_key VARCHAR(191) NULL,
            is_read TINYINT(1) NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            read_at DATETIME NULL,
            PRIMARY KEY (notification_id),
            KEY idx_notifications_student_read_created (student_id, is_read, created_at),
            KEY idx_notifications_recipient_read_created (recipient_account_id, is_read, created_at)
        ) ENGINE=InnoDB
    `);
}

async function getNotificationDeliveryContext(connection) {
    await ensureNotificationsTable(connection);

    const notificationColumns = await getTableColumns(connection, 'notifications');
    const hasAuthAccounts = await tableExists(connection, 'auth_accounts');

    return {
        notificationColumns,
        hasAuthAccounts,
        useAccountRecipients: notificationColumns.has('recipient_account_id') && hasAuthAccounts,
        useStudentRecipients: notificationColumns.has('student_id'),
    };
}

async function insertNotificationRows(connection, notificationColumns, rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
        return 0;
    }

    const candidateColumns = [
        'recipient_account_id',
        'student_id',
        'recipient_role',
        'notification_type',
        'title',
        'message',
        'reference_type',
        'reference_id',
        'notification_key',
        'is_read',
        'created_at',
        'read_at',
    ];

    const insertColumns = candidateColumns
        .filter((column) => notificationColumns.has(column))
        .filter((column) => rows.some((row) => row[column] !== undefined));

    if (insertColumns.length === 0) {
        return 0;
    }

    const tuple = `(${insertColumns.map(() => '?').join(', ')})`;
    const values = [];

    for (const row of rows) {
        for (const column of insertColumns) {
            values.push(row[column] ?? null);
        }
    }

    const [result] = await connection.query(
        `INSERT IGNORE INTO notifications (${insertColumns.join(', ')}) VALUES ${rows.map(() => tuple).join(', ')}`,
        values
    );

    return Number(result?.affectedRows || 0);
}

async function sendStudentNotification(connection, {
    studentId = null,
    notificationType,
    title,
    message,
    referenceType = 'system',
    referenceId = null,
    notificationKey = null,
}) {
    if (!notificationType || !title || !message) {
        return 0;
    }

    const context = await getNotificationDeliveryContext(connection);
    const rows = [];

    if (context.useAccountRecipients) {
        const authColumns = await getTableColumns(connection, 'auth_accounts');
        const whereParts = ["role = 'student'"];
        const values = [];

        if (authColumns.has('is_active')) {
            whereParts.push('is_active = 1');
        }

        if (studentId) {
            if (!authColumns.has('student_id')) {
                return 0;
            }
            whereParts.push('student_id = ?');
            values.push(studentId);
        }

        const [targets] = await connection.query(
            `SELECT account_id${authColumns.has('student_id') ? ', student_id' : ''}
             FROM auth_accounts
             WHERE ${whereParts.join(' AND ')}`,
            values
        );

        if (targets.length === 0) {
            if (studentId) {
                await ensureStudentAuthAccount(connection, studentId);
            } else {
                await ensureAllStudentAuthAccounts(connection);
            }
        }

        const [refreshedTargets] = await connection.query(
            `SELECT account_id${authColumns.has('student_id') ? ', student_id' : ''}
             FROM auth_accounts
             WHERE ${whereParts.join(' AND ')}`,
            values
        );

        for (const target of refreshedTargets) {
            const row = {
                recipient_account_id: target.account_id,
                recipient_role: 'student',
                notification_type: notificationType,
                title,
                message,
                reference_type: referenceType,
                reference_id: referenceId,
                is_read: 0,
            };

            if (context.notificationColumns.has('student_id') && target.student_id) {
                row.student_id = target.student_id;
            }

            if (notificationKey) {
                row.notification_key = notificationKey;
            }

            rows.push(row);
        }

        return insertNotificationRows(connection, context.notificationColumns, rows);
    }

    if (context.useStudentRecipients) {
        let targetStudentIds = [];

        if (studentId) {
            targetStudentIds = [studentId];
        } else if (await tableExists(connection, 'students')) {
            const [students] = await connection.query('SELECT student_id FROM students');
            targetStudentIds = students
                .map((row) => (row.student_id || '').toString().trim())
                .filter(Boolean);
        }

        for (const targetStudentId of targetStudentIds) {
            const row = {
                student_id: targetStudentId,
                recipient_role: 'student',
                notification_type: notificationType,
                title,
                message,
                reference_type: referenceType,
                reference_id: referenceId,
                is_read: 0,
            };

            if (notificationKey) {
                row.notification_key = `${notificationKey}:${targetStudentId}`;
            }

            rows.push(row);
        }

        return insertNotificationRows(connection, context.notificationColumns, rows);
    }

    return 0;
}

async function sendAdminNotification(connection, {
    adminId = null,
    notificationType,
    title,
    message,
    referenceType = 'system',
    referenceId = null,
    notificationKey = null,
}) {
    if (!notificationType || !title || !message) {
        return 0;
    }

    const context = await getNotificationDeliveryContext(connection);
    const rows = [];

    if (context.useAccountRecipients) {
        const authColumns = await getTableColumns(connection, 'auth_accounts');
        const whereParts = ["role = 'admin'"];
        const values = [];

        if (authColumns.has('is_active')) {
            whereParts.push('is_active = 1');
        }

        const normalizedAdminId = Number(adminId);
        if (Number.isInteger(normalizedAdminId) && normalizedAdminId > 0) {
            if (!authColumns.has('admin_id')) {
                return 0;
            }

            whereParts.push('admin_id = ?');
            values.push(normalizedAdminId);
        }

        const selectAdminId = authColumns.has('admin_id') ? ', admin_id' : '';
        const [targets] = await connection.query(
            `SELECT account_id${selectAdminId}
             FROM auth_accounts
             WHERE ${whereParts.join(' AND ')}`,
            values
        );

        if (targets.length === 0) {
            await ensureAllAdminAuthAccounts(connection);
        }

        const [refreshedTargets] = await connection.query(
            `SELECT account_id${selectAdminId}
             FROM auth_accounts
             WHERE ${whereParts.join(' AND ')}`,
            values
        );

        for (const target of refreshedTargets) {
            const row = {
                recipient_account_id: target.account_id,
                recipient_role: 'admin',
                notification_type: notificationType,
                title,
                message,
                reference_type: referenceType,
                reference_id: referenceId,
                is_read: 0,
            };

            if (notificationKey) {
                row.notification_key = notificationKey;
            }

            rows.push(row);
        }

        return insertNotificationRows(connection, context.notificationColumns, rows);
    }

    const fallbackRow = {
        recipient_role: 'admin',
        notification_type: notificationType,
        title,
        message,
        reference_type: referenceType,
        reference_id: referenceId,
        is_read: 0,
    };

    if (notificationKey) {
        fallbackRow.notification_key = notificationKey;
    }

    return insertNotificationRows(connection, context.notificationColumns, [fallbackRow]);
}

async function fetchStudentNotifications(connection, studentId, limit = 50) {
    const context = await getNotificationDeliveryContext(connection);
    const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 50, 1), 100);
    const idColumn = context.notificationColumns.has('notification_id')
        ? 'notification_id'
        : (context.notificationColumns.has('id') ? 'id' : null);

    if (!idColumn) {
        return [];
    }

    if (context.useAccountRecipients) {
        const authColumns = await getTableColumns(connection, 'auth_accounts');
        if (!authColumns.has('student_id')) {
            return [];
        }

        const [rows] = await connection.query(`
            SELECT
                n.${idColumn} AS notification_id,
                ${context.notificationColumns.has('notification_type') ? 'n.notification_type' : "'SYSTEM' AS notification_type"},
                n.title,
                n.message,
                ${context.notificationColumns.has('reference_type') ? 'n.reference_type' : "'system' AS reference_type"},
                ${context.notificationColumns.has('reference_id') ? 'n.reference_id' : 'NULL AS reference_id'},
                ${context.notificationColumns.has('is_read') ? 'n.is_read' : '0 AS is_read'},
                ${context.notificationColumns.has('created_at') ? 'n.created_at' : 'NOW() AS created_at'},
                ${context.notificationColumns.has('read_at') ? 'n.read_at' : 'NULL AS read_at'}
            FROM notifications n
            JOIN auth_accounts aa ON aa.account_id = n.recipient_account_id
            WHERE aa.role = 'student'
              AND aa.student_id = ?
            ORDER BY ${context.notificationColumns.has('created_at') ? 'n.created_at DESC,' : ''} n.${idColumn} DESC
            LIMIT ${safeLimit}
        `, [studentId]);

        return rows.map((row) => ({
            notification_id: Number(row.notification_id),
            notification_type: row.notification_type || 'SYSTEM',
            title: row.title || 'Notification',
            message: row.message || '',
            reference_type: row.reference_type || 'system',
            reference_id: row.reference_id,
            is_read: Number(row.is_read) === 1,
            created_at: row.created_at,
            read_at: row.read_at,
        }));
    }

    if (context.useStudentRecipients) {
        const [rows] = await connection.query(`
            SELECT
                ${idColumn} AS notification_id,
                ${context.notificationColumns.has('notification_type') ? 'notification_type' : "'SYSTEM' AS notification_type"},
                title,
                message,
                ${context.notificationColumns.has('reference_type') ? 'reference_type' : "'system' AS reference_type"},
                ${context.notificationColumns.has('reference_id') ? 'reference_id' : 'NULL AS reference_id'},
                ${context.notificationColumns.has('is_read') ? 'is_read' : '0 AS is_read'},
                ${context.notificationColumns.has('created_at') ? 'created_at' : 'NOW() AS created_at'},
                ${context.notificationColumns.has('read_at') ? 'read_at' : 'NULL AS read_at'}
            FROM notifications
            WHERE student_id = ?
            ORDER BY ${context.notificationColumns.has('created_at') ? 'created_at DESC,' : ''} ${idColumn} DESC
            LIMIT ${safeLimit}
        `, [studentId]);

        return rows.map((row) => ({
            notification_id: Number(row.notification_id),
            notification_type: row.notification_type || 'SYSTEM',
            title: row.title || 'Notification',
            message: row.message || '',
            reference_type: row.reference_type || 'system',
            reference_id: row.reference_id,
            is_read: Number(row.is_read) === 1,
            created_at: row.created_at,
            read_at: row.read_at,
        }));
    }

    return [];
}

async function markNotificationReadForStudent(connection, notificationId, studentId) {
    const context = await getNotificationDeliveryContext(connection);
    const idColumn = context.notificationColumns.has('notification_id')
        ? 'notification_id'
        : (context.notificationColumns.has('id') ? 'id' : null);

    if (!idColumn) {
        return 0;
    }

    const setParts = [];
    if (context.notificationColumns.has('is_read')) {
        setParts.push('is_read = 1');
    }
    if (context.notificationColumns.has('read_at')) {
        setParts.push('read_at = NOW()');
    }

    if (setParts.length === 0) {
        return 0;
    }

    if (context.useAccountRecipients) {
        const authColumns = await getTableColumns(connection, 'auth_accounts');
        if (!authColumns.has('student_id')) {
            return 0;
        }

        const [result] = await connection.query(
            `UPDATE notifications n
             JOIN auth_accounts aa ON aa.account_id = n.recipient_account_id
             SET ${setParts.map((part) => `n.${part}`).join(', ')}
             WHERE n.${idColumn} = ?
               AND aa.role = 'student'
               AND aa.student_id = ?`,
            [notificationId, studentId]
        );

        return Number(result?.affectedRows || 0);
    }

    if (context.useStudentRecipients) {
        const [result] = await connection.query(
            `UPDATE notifications
             SET ${setParts.join(', ')}
             WHERE ${idColumn} = ?
               AND student_id = ?`,
            [notificationId, studentId]
        );

        return Number(result?.affectedRows || 0);
    }

    return 0;
}

async function fetchAdminNotifications(connection, adminId, limit = 50) {
    const context = await getNotificationDeliveryContext(connection);
    const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 50, 1), 100);
    const idColumn = context.notificationColumns.has('notification_id')
        ? 'notification_id'
        : (context.notificationColumns.has('id') ? 'id' : null);

    if (!idColumn) {
        return [];
    }

    if (context.useAccountRecipients) {
        const authColumns = await getTableColumns(connection, 'auth_accounts');
        const whereParts = ["aa.role = 'admin'"];
        const values = [];

        const normalizedAdminId = Number(adminId);
        if (Number.isInteger(normalizedAdminId) && normalizedAdminId > 0 && authColumns.has('admin_id')) {
            whereParts.push('aa.admin_id = ?');
            values.push(normalizedAdminId);
        } else if (authColumns.has('admin_id')) {
            return [];
        }

        const [rows] = await connection.query(`
            SELECT
                n.${idColumn} AS notification_id,
                ${context.notificationColumns.has('notification_type') ? 'n.notification_type' : "'SYSTEM' AS notification_type"},
                n.title,
                n.message,
                ${context.notificationColumns.has('reference_type') ? 'n.reference_type' : "'system' AS reference_type"},
                ${context.notificationColumns.has('reference_id') ? 'n.reference_id' : 'NULL AS reference_id'},
                ${context.notificationColumns.has('is_read') ? 'n.is_read' : '0 AS is_read'},
                ${context.notificationColumns.has('created_at') ? 'n.created_at' : 'NOW() AS created_at'},
                ${context.notificationColumns.has('read_at') ? 'n.read_at' : 'NULL AS read_at'}
            FROM notifications n
            JOIN auth_accounts aa ON aa.account_id = n.recipient_account_id
            WHERE ${whereParts.join(' AND ')}
            ORDER BY ${context.notificationColumns.has('created_at') ? 'n.created_at DESC,' : ''} n.${idColumn} DESC
            LIMIT ${safeLimit}
        `, values);

        return rows.map((row) => ({
            notification_id: Number(row.notification_id),
            notification_type: row.notification_type || 'SYSTEM',
            title: row.title || 'Notification',
            message: row.message || '',
            reference_type: row.reference_type || 'system',
            reference_id: row.reference_id,
            is_read: Number(row.is_read) === 1,
            created_at: row.created_at,
            read_at: row.read_at,
        }));
    }

    const [rows] = await connection.query(`
        SELECT
            ${idColumn} AS notification_id,
            ${context.notificationColumns.has('notification_type') ? 'notification_type' : "'SYSTEM' AS notification_type"},
            title,
            message,
            ${context.notificationColumns.has('reference_type') ? 'reference_type' : "'system' AS reference_type"},
            ${context.notificationColumns.has('reference_id') ? 'reference_id' : 'NULL AS reference_id'},
            ${context.notificationColumns.has('is_read') ? 'is_read' : '0 AS is_read'},
            ${context.notificationColumns.has('created_at') ? 'created_at' : 'NOW() AS created_at'},
            ${context.notificationColumns.has('read_at') ? 'read_at' : 'NULL AS read_at'}
        FROM notifications
        WHERE recipient_role = 'admin'
        ORDER BY ${context.notificationColumns.has('created_at') ? 'created_at DESC,' : ''} ${idColumn} DESC
        LIMIT ${safeLimit}
    `);

    return rows.map((row) => ({
        notification_id: Number(row.notification_id),
        notification_type: row.notification_type || 'SYSTEM',
        title: row.title || 'Notification',
        message: row.message || '',
        reference_type: row.reference_type || 'system',
        reference_id: row.reference_id,
        is_read: Number(row.is_read) === 1,
        created_at: row.created_at,
        read_at: row.read_at,
    }));
}

async function markNotificationReadForAdmin(connection, notificationId, adminId) {
    const context = await getNotificationDeliveryContext(connection);
    const idColumn = context.notificationColumns.has('notification_id')
        ? 'notification_id'
        : (context.notificationColumns.has('id') ? 'id' : null);

    if (!idColumn) {
        return 0;
    }

    const setParts = [];
    if (context.notificationColumns.has('is_read')) {
        setParts.push('is_read = 1');
    }
    if (context.notificationColumns.has('read_at')) {
        setParts.push('read_at = NOW()');
    }

    if (setParts.length === 0) {
        return 0;
    }

    if (context.useAccountRecipients) {
        const authColumns = await getTableColumns(connection, 'auth_accounts');
        const whereParts = ['n.' + idColumn + ' = ?', "aa.role = 'admin'"];
        const values = [notificationId];

        const normalizedAdminId = Number(adminId);
        if (Number.isInteger(normalizedAdminId) && normalizedAdminId > 0 && authColumns.has('admin_id')) {
            whereParts.push('aa.admin_id = ?');
            values.push(normalizedAdminId);
        } else if (authColumns.has('admin_id')) {
            return 0;
        }

        const [result] = await connection.query(
            `UPDATE notifications n
             JOIN auth_accounts aa ON aa.account_id = n.recipient_account_id
             SET ${setParts.map((part) => `n.${part}`).join(', ')}
             WHERE ${whereParts.join(' AND ')}`,
            values
        );

        return Number(result?.affectedRows || 0);
    }

    const [result] = await connection.query(
        `UPDATE notifications
         SET ${setParts.join(', ')}
         WHERE ${idColumn} = ?
           AND recipient_role = 'admin'`,
        [notificationId]
    );

    return Number(result?.affectedRows || 0);
}

async function ensureDocumentSupportTables(connection) {
    await connection.query(`
        CREATE TABLE IF NOT EXISTS document_types (
            document_type_id TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
            code VARCHAR(40) NOT NULL,
            name VARCHAR(120) NOT NULL,
            description VARCHAR(255) NULL,
            allowed_extensions VARCHAR(120) NULL,
            is_required TINYINT(1) NOT NULL DEFAULT 1,
            PRIMARY KEY (document_type_id),
            UNIQUE KEY uq_document_types_code (code)
        ) ENGINE=InnoDB
    `);

    await connection.query(`
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
          is_required = VALUES(is_required)
    `);

    await connection.query(`
        CREATE TABLE IF NOT EXISTS student_documents (
            document_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            student_id VARCHAR(50) NOT NULL,
            application_id INT NOT NULL,
            document_type_code VARCHAR(40) NULL,
            document_type_name VARCHAR(120) NULL,
            original_filename VARCHAR(255) NOT NULL,
            storage_path VARCHAR(500) NOT NULL,
            mime_type VARCHAR(120) NULL,
            file_size_bytes BIGINT UNSIGNED NULL,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (document_id),
            KEY idx_student_documents_student_uploaded (student_id, uploaded_at),
            KEY idx_student_documents_application (application_id)
        ) ENGINE=InnoDB
    `);
}

async function getDocumentTypeMap(connection) {
    if (!(await tableExists(connection, 'document_types'))) {
        return new Map();
    }

    const [rows] = await connection.query(
        'SELECT document_type_id, code, name FROM document_types'
    );

    const map = new Map();
    for (const row of rows) {
        map.set(row.code, {
            id: row.document_type_id,
            name: row.name,
        });
    }

    return map;
}

function getUploadedDocumentEntries(filesMap) {
    const items = [];

    for (const meta of DOCUMENT_UPLOAD_FIELDS) {
        const file = filesMap?.[meta.field]?.[0];
        if (!file) continue;
        items.push({ meta, file });
    }

    return items;
}

async function getStudentApplicationForDocumentChange(connection, applicationId) {
    const [rows] = await connection.query(
        `SELECT id, status, student_id
         FROM applications
         WHERE id = ?
         LIMIT 1`,
        [applicationId]
    );

    if (rows.length === 0) {
        throw new HttpError(404, 'Application not found.');
    }

    return rows[0];
}

async function canStudentModifyApplicationDocuments(connection, studentId, applicationRow, applicationId) {
    const normalizedStudentId = (studentId || '').toString().trim();
    if (!normalizedStudentId) return false;

    const applicationStudentId = (applicationRow?.student_id || '').toString().trim();
    if (applicationStudentId && applicationStudentId === normalizedStudentId) {
        return true;
    }

    if (!(await tableExists(connection, 'student_documents'))) {
        return false;
    }

    const [rows] = await connection.query(
        `SELECT 1
         FROM student_documents
         WHERE student_id = ?
           AND application_id = ?
         LIMIT 1`,
        [normalizedStudentId, applicationId]
    );

    return rows.length > 0;
}

async function resolveAdminId(connection, requestedAdminId) {
    const explicitId = Number(requestedAdminId);
    if (Number.isInteger(explicitId) && explicitId > 0) {
        const [rows] = await connection.query(
            'SELECT admin_id FROM admins WHERE admin_id = ? LIMIT 1',
            [explicitId]
        );
        if (rows.length > 0) return explicitId;
    }

    const [fallbackRows] = await connection.query(
        'SELECT admin_id FROM admins ORDER BY admin_id ASC LIMIT 1'
    );
    return fallbackRows.length > 0 ? fallbackRows[0].admin_id : null;
}

async function fetchDocumentRows(connection, whereColumn, whereValue) {
    if (!(await tableExists(connection, 'student_documents'))) {
        return [];
    }

    const columns = await getTableColumns(connection, 'student_documents');
    if (!columns.has(whereColumn)) {
        return [];
    }

    const hasDocumentTypes = await tableExists(connection, 'document_types');
    const selectParts = [
        'sd.document_id',
        'sd.student_id',
        columns.has('application_id') ? 'sd.application_id' : 'NULL AS application_id',
        'sd.original_filename',
        'sd.storage_path',
        columns.has('mime_type') ? 'sd.mime_type' : 'NULL AS mime_type',
        columns.has('file_size_bytes') ? 'sd.file_size_bytes' : 'NULL AS file_size_bytes',
        columns.has('uploaded_at') ? 'sd.uploaded_at' : 'NULL AS uploaded_at',
    ];

    let joinClause = '';
    if (columns.has('document_type_code')) {
        selectParts.push('sd.document_type_code');
        selectParts.push(columns.has('document_type_name') ? 'sd.document_type_name' : 'NULL AS document_type_name');
    } else if (columns.has('document_type_id') && hasDocumentTypes) {
        joinClause = 'LEFT JOIN document_types dt ON dt.document_type_id = sd.document_type_id';
        selectParts.push('dt.code AS document_type_code');
        selectParts.push('dt.name AS document_type_name');
    } else if (columns.has('document_type_id')) {
        selectParts.push('CAST(sd.document_type_id AS CHAR) AS document_type_code');
        selectParts.push('NULL AS document_type_name');
    } else {
        selectParts.push('NULL AS document_type_code');
        selectParts.push('NULL AS document_type_name');
    }

    const whereParts = [`sd.${whereColumn} = ?`];
    if (columns.has('is_active')) {
        whereParts.push('sd.is_active = 1');
    }

    const orderParts = [];
    if (columns.has('uploaded_at')) {
        orderParts.push('sd.uploaded_at DESC');
    }
    orderParts.push('sd.document_id DESC');

    const sql = `
        SELECT ${selectParts.join(', ')}
        FROM student_documents sd
        ${joinClause}
        WHERE ${whereParts.join(' AND ')}
        ORDER BY ${orderParts.join(', ')}
    `;

    const [rows] = await connection.query(sql, [whereValue]);

    return rows.map((row) => ({
        document_id: row.document_id,
        student_id: row.student_id,
        application_id: row.application_id,
        document_type_code: row.document_type_code || 'unknown',
        document_type_name: row.document_type_name || 'Uploaded Document',
        original_filename: row.original_filename,
        storage_path: row.storage_path,
        file_url: toFileUrl(row.storage_path),
        mime_type: row.mime_type,
        file_size_bytes: row.file_size_bytes,
        uploaded_at: row.uploaded_at,
    }));
}

/**
 * 1. Submit Application with transactional upload persistence
 */
exports.submitApplicationWithTransaction = async (req, res) => {
    const studentId = (req.body?.student_id || '').toString().trim();
    const name = (req.body?.name || '').toString().trim();
    const program = (req.body?.program || '').toString().trim();
    const yearLevel = (req.body?.year_level || '').toString().trim();
    const scholarshipId = Number(req.body?.scholarship_id);
    const studentGpa = Number(req.body?.gpa);
    const uploadedEntries = getUploadedDocumentEntries(req.files);

    const connection = await db.getConnection();
    let transactionStarted = false;
    let duplicateGuardKey = null;
    let duplicateGuardAcquired = false;

    try {
        if (!studentId || !name || !program || !yearLevel || !Number.isFinite(scholarshipId) || !Number.isFinite(studentGpa)) {
            throw new HttpError(400, 'Missing required application fields.');
        }

        if (studentGpa < 1 || studentGpa > 5) {
            throw new HttpError(400, 'GPA must be between 1.00 and 5.00.');
        }

        const missingDocs = DOCUMENT_UPLOAD_FIELDS.filter((meta) => !req.files?.[meta.field]?.[0]);
        if (missingDocs.length > 0) {
            throw new HttpError(400, 'Please upload all required documents before submitting.');
        }

        await connection.beginTransaction();
        transactionStarted = true;

        // Guard against concurrent duplicate submissions for the same student + scholarship pair.
        duplicateGuardKey = `apply:${studentId}:${scholarshipId}`;
        const [guardRows] = await connection.query('SELECT GET_LOCK(?, 5) AS lock_acquired', [duplicateGuardKey]);
        if (Number(guardRows?.[0]?.lock_acquired) !== 1) {
            throw new HttpError(503, 'Please try submitting again in a few seconds.');
        }
        duplicateGuardAcquired = true;

        const studentColumns = await getTableColumns(connection, 'students');
        const preferredEmail = (req.body?.email || '').toString().trim().toLowerCase();
        const learnerRefRaw = (req.body?.learner_reference_number || '').toString().trim();
        const hasLearnerRef = learnerRefRaw.length > 0;
        const learnerRef = hasLearnerRef ? learnerRefRaw : null;
        const safeEmail = preferredEmail || `${studentId.toLowerCase()}@student.local`;

        const [existingStudent] = await connection.query(
            'SELECT student_id FROM students WHERE student_id = ?',
            [studentId]
        );

        if (existingStudent.length === 0) {
            const insertFields = ['student_id'];
            const insertValues = [studentId];

            const candidatePairs = [
                ['name', name],
                ['email', safeEmail],
                ['program', program],
                ['year_level', yearLevel],
                ['gpa', studentGpa],
                ['learner_reference_number', learnerRef],
                ['contact_number', (req.body?.contact_number || '').toString().trim() || null],
                ['address', (req.body?.address || '').toString().trim() || null],
                ['date_of_birth', (req.body?.date_of_birth || '').toString().trim() || null],
                ['family_income', (req.body?.family_income || '').toString().trim() || null],
                ['parent_occupation', (req.body?.parent_occupation || '').toString().trim() || null],
                ['special_membership', (req.body?.special_membership || 'none').toString().trim() || 'none'],
            ];

            for (const [column, value] of candidatePairs) {
                if (!studentColumns.has(column)) continue;
                if (column === 'learner_reference_number' && !hasLearnerRef) continue;
                insertFields.push(column);
                insertValues.push(value);
            }

            const placeholders = insertFields.map(() => '?').join(', ');
            await connection.query(
                `INSERT INTO students (${insertFields.join(', ')}) VALUES (${placeholders})`,
                insertValues
            );
        } else {
            const updates = [];
            const updateValues = [];

            const updatePairs = [
                ['name', name],
                ['program', program],
                ['year_level', yearLevel],
                ['gpa', studentGpa],
                ['email', safeEmail],
                ['learner_reference_number', learnerRef],
                ['contact_number', (req.body?.contact_number || '').toString().trim() || null],
                ['address', (req.body?.address || '').toString().trim() || null],
                ['date_of_birth', (req.body?.date_of_birth || '').toString().trim() || null],
                ['family_income', (req.body?.family_income || '').toString().trim() || null],
                ['parent_occupation', (req.body?.parent_occupation || '').toString().trim() || null],
                ['special_membership', (req.body?.special_membership || 'none').toString().trim() || 'none'],
            ];

            for (const [column, value] of updatePairs) {
                if (!studentColumns.has(column)) continue;
                if (column === 'learner_reference_number' && !hasLearnerRef) continue;
                updates.push(`${column} = ?`);
                updateValues.push(value);
            }

            if (updates.length > 0) {
                updateValues.push(studentId);
                await connection.query(
                    `UPDATE students SET ${updates.join(', ')} WHERE student_id = ?`,
                    updateValues
                );
            }
        }

        await ensureStudentAuthAccount(connection, studentId, safeEmail);

        const scholarshipColumns = await getTableColumns(connection, 'scholarships');
        const scholarshipMinimumColumn = getFirstExistingColumn(scholarshipColumns, SCHOLARSHIP_MINIMUM_KEYS);
        const minimumSelect = scholarshipMinimumColumn
            ? `${scholarshipMinimumColumn} AS min_requirement`
            : 'NULL AS min_requirement';

        const [scholarshipRows] = await connection.query(
            `SELECT ${minimumSelect} FROM scholarships WHERE id = ? LIMIT 1`,
            [scholarshipId]
        );

        if (scholarshipRows.length === 0) {
            throw new HttpError(404, 'Scholarship not found.');
        }

        const minGpa = parseFiniteNumber(scholarshipRows[0].min_requirement, 1.0);
        if (studentGpa > minGpa) {
            throw new HttpError(400, `Your GWA does not meet the scholarship minimum GWA requirement of ${minGpa.toFixed(2)}.`);
        }

        const [existingApplicationRows] = await connection.query(
            `SELECT id, status
             FROM applications
             WHERE student_id = ?
               AND scholarship_id = ?
             ORDER BY id DESC
             LIMIT 1`,
            [studentId, scholarshipId]
        );

        if (existingApplicationRows.length > 0) {
            const existingStatus = (existingApplicationRows[0].status || 'Submitted').toString();
            throw new HttpError(
                409,
                `You already submitted an application for this scholarship (current status: ${existingStatus}). Duplicate applications are not allowed.`
            );
        }

        const status = 'Eligible';
        const applicationsColumns = await getTableColumns(connection, 'applications');

        const applicationFields = ['student_id', 'scholarship_id', 'gpa', 'status'];
        const applicationValues = [studentId, scholarshipId, studentGpa, status];

        if (applicationsColumns.has('letter_of_intent')) {
            applicationFields.push('letter_of_intent');
            applicationValues.push(req.body?.letter_of_intent || null);
        } else if (applicationsColumns.has('essay')) {
            applicationFields.push('essay');
            applicationValues.push(req.body?.letter_of_intent || null);
        }

        const applicationPlaceholders = applicationFields.map(() => '?').join(', ');

        const [insertResult] = await connection.query(
            `INSERT INTO applications (${applicationFields.join(', ')}) VALUES (${applicationPlaceholders})`,
            applicationValues
        );

        const applicationId = insertResult.insertId;

        if (await tableExists(connection, 'application_details')) {
            const detailColumns = await getTableColumns(connection, 'application_details');
            const fields = ['application_id'];
            const values = [applicationId];

            const detailCandidates = [
                ['full_name', req.body?.full_name || name],
                ['date_of_birth', req.body?.date_of_birth || null],
                ['address', req.body?.address || null],
                ['contact_number', req.body?.contact_number || null],
                ['email', req.body?.email || null],
                ['course_program', req.body?.course_program || program],
                ['year_level', req.body?.year_level || yearLevel],
                ['gwa', req.body?.gwa || studentGpa],
                ['learner_reference_number', req.body?.learner_reference_number || null],
                ['family_income', req.body?.family_income || null],
                ['parent_occupation', req.body?.parent_occupation || null],
                ['special_membership', req.body?.special_membership || 'none'],
                ['letter_of_intent', req.body?.letter_of_intent || null],
            ];

            for (const [column, value] of detailCandidates) {
                if (!detailColumns.has(column)) continue;
                fields.push(column);
                values.push(value === '' ? null : value);
            }

            const placeholders = fields.map(() => '?').join(', ');
            await connection.query(
                `INSERT INTO application_details (${fields.join(', ')}) VALUES (${placeholders})`,
                values
            );
        }

        await ensureDocumentSupportTables(connection);
        const docColumns = await getTableColumns(connection, 'student_documents');
        const typeMap = docColumns.has('document_type_id') ? await getDocumentTypeMap(connection) : new Map();

        for (const { meta, file } of uploadedEntries) {
            const fields = [];
            const values = [];

            if (docColumns.has('student_id')) {
                fields.push('student_id');
                values.push(studentId);
            }

            if (docColumns.has('application_id')) {
                fields.push('application_id');
                values.push(applicationId);
            }

            if (docColumns.has('document_type_id')) {
                const typeInfo = typeMap.get(meta.code);
                if (!typeInfo) {
                    throw new HttpError(500, `Document type mapping missing for ${meta.code}.`);
                }
                fields.push('document_type_id');
                values.push(typeInfo.id);
            }

            if (docColumns.has('document_type_code')) {
                fields.push('document_type_code');
                values.push(meta.code);
            }

            if (docColumns.has('document_type_name')) {
                fields.push('document_type_name');
                values.push(meta.name);
            }

            if (docColumns.has('original_filename')) {
                fields.push('original_filename');
                values.push(file.originalname);
            }

            if (docColumns.has('storage_path')) {
                fields.push('storage_path');
                values.push(`/uploads/documents/${file.filename}`);
            }

            if (docColumns.has('mime_type')) {
                fields.push('mime_type');
                values.push(file.mimetype || null);
            }

            if (docColumns.has('file_size_bytes')) {
                fields.push('file_size_bytes');
                values.push(file.size || null);
            }

            if (docColumns.has('is_active')) {
                fields.push('is_active');
                values.push(1);
            }

            const placeholders = fields.map(() => '?').join(', ');
            await connection.query(
                `INSERT INTO student_documents (${fields.join(', ')}) VALUES (${placeholders})`,
                values
            );
        }

        await connection.commit();

        res.status(201).json({
            message: 'Application submitted successfully!',
            status,
            application_id: applicationId,
        });
    } catch (error) {
        if (transactionStarted) {
            try {
                await connection.rollback();
            } catch {
                // ignore rollback secondary failures
            }
        }

        await cleanupUploadedFiles(req.files);

        if (error instanceof HttpError) {
            res.status(error.status).json({ error: error.message });
            return;
        }

        if (error?.code === 'ER_DUP_ENTRY') {
            res.status(409).json({
                error: 'You already submitted an application for this scholarship. Duplicate applications are not allowed.',
            });
            return;
        }

        console.error('Application transaction failed:', error);
        res.status(500).json({ error: 'Failed to submit application.' });
    } finally {
        if (duplicateGuardAcquired && duplicateGuardKey) {
            try {
                await connection.query('DO RELEASE_LOCK(?)', [duplicateGuardKey]);
            } catch {
                // ignore lock release failures
            }
        }

        connection.release();
    }
};

/**
 * 2. Get all applications for admin dashboard/review
 */
exports.getAllApplications = async (_req, res) => {
    const connection = await db.getConnection();

    try {
        const hasDetails = await tableExists(connection, 'application_details');
        const hasStudentDocuments = await tableExists(connection, 'student_documents');
        const appColumns = await getTableColumns(connection, 'applications');
        const docColumns = hasStudentDocuments
            ? await getTableColumns(connection, 'student_documents')
            : new Set();

        let detailsSelect = '';
        let detailsJoin = '';
        let essaySelect = 'NULL AS essay';

        if (hasDetails) {
            const detailColumns = await getTableColumns(connection, 'application_details');
            detailsSelect = ', ad.full_name, ad.learner_reference_number, ad.course_program';

            if (detailColumns.has('letter_of_intent')) {
                essaySelect = 'ad.letter_of_intent AS essay';
            } else if (detailColumns.has('essay')) {
                essaySelect = 'ad.essay AS essay';
            } else if (appColumns.has('letter_of_intent')) {
                essaySelect = 'a.letter_of_intent AS essay';
            } else if (appColumns.has('essay')) {
                essaySelect = 'a.essay AS essay';
            }

            detailsJoin = 'LEFT JOIN application_details ad ON ad.application_id = a.id';
        } else if (appColumns.has('letter_of_intent')) {
            essaySelect = 'a.letter_of_intent AS essay';
        } else if (appColumns.has('essay')) {
            essaySelect = 'a.essay AS essay';
        }

        let docsSelect = '';
        let docsJoin = '';
        if (hasStudentDocuments && docColumns.has('application_id')) {
            const docWhere = docColumns.has('is_active') ? 'WHERE is_active = 1' : '';
            docsSelect = ', COALESCE(sd.document_count, 0) AS document_count';
            docsJoin = `
                LEFT JOIN (
                    SELECT application_id, COUNT(*) AS document_count
                    FROM student_documents
                    ${docWhere}
                    GROUP BY application_id
                ) sd ON sd.application_id = a.id
            `;
        }

        const [rows] = await connection.query(`
            SELECT
                a.id AS application_id,
                s.name AS student_name,
                s.student_id,
                s.year_level,
                sch.title AS scholarship_title,
                a.gpa AS submitted_gpa,
                sch.min_gpa,
                a.status,
                a.applied_at,
                ${essaySelect}
                ${detailsSelect}
                ${docsSelect}
            FROM applications a
            JOIN students s ON a.student_id = s.student_id
            JOIN scholarships sch ON a.scholarship_id = sch.id
            ${detailsJoin}
            ${docsJoin}
            ORDER BY
                CASE a.status
                    WHEN 'Approved' THEN 1
                    WHEN 'Eligible' THEN 2
                    WHEN 'Under Review' THEN 3
                    WHEN 'Pending' THEN 4
                    WHEN 'Rejected' THEN 5
                    ELSE 6
                END ASC,
                a.applied_at DESC,
                a.id DESC
        `);

            const normalizedRows = rows.map((row) => ({
                ...row,
                status: getEffectiveApplicationStatus(row.status, row.document_count),
            }));

            res.status(200).json(normalizedRows);
    } catch (error) {
        console.error('Failed to fetch applications:', error);
        res.status(500).json({ error: 'Failed to retrieve applications.' });
    } finally {
        connection.release();
    }
};

/**
 * 3. Update application status from admin review
 */
exports.updateApplicationStatus = async (req, res) => {
    const id = Number(req.params.id);
    const requestedStatus = (req.body?.status || '').toString().trim();
    const status = requestedStatus.toLowerCase() === 'denied' ? 'Rejected' : requestedStatus;

    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'Invalid application id.' });
    }

    if (!APPLICATION_STATUSES.has(status)) {
        return res.status(400).json({ error: 'Invalid application status.' });
    }

    const connection = await db.getConnection();

    try {
        const [existingRows] = await connection.query(
            `SELECT
                a.id,
                a.student_id,
                a.status,
                sch.title AS scholarship_title
             FROM applications a
             LEFT JOIN scholarships sch ON sch.id = a.scholarship_id
             WHERE a.id = ?
             LIMIT 1`,
            [id]
        );

        if (existingRows.length === 0) {
            return res.status(404).json({ error: 'Application not found.' });
        }

        const previousStatus = (existingRows[0].status || '').toString().trim();
        const studentId = (existingRows[0].student_id || '').toString().trim();
        const scholarshipTitle = (existingRows[0].scholarship_title || 'Scholarship').toString();
        const changedStatus = previousStatus !== status;
        const becameFinalStatus = status === 'Approved' || status === 'Rejected';
        const hasNativeTrigger = changedStatus && becameFinalStatus
            ? await triggerExists(connection, 'trg_applications_after_update')
            : false;

        if (hasNativeTrigger && studentId) {
            await ensureStudentAuthAccount(connection, studentId);
        }

        const appColumns = await getTableColumns(connection, 'applications');
        const assignments = ['status = ?'];
        const values = [status];

        if (appColumns.has('reviewed_at')) {
            assignments.push('reviewed_at = NOW()');
        }

        if (appColumns.has('reviewed_by_admin_id')) {
            const reviewerId = parseFiniteNumber(req.body?.admin_id, null);
            assignments.push('reviewed_by_admin_id = ?');
            values.push(reviewerId);
        }

        values.push(id);

        const [result] = await connection.query(
            `UPDATE applications SET ${assignments.join(', ')} WHERE id = ?`,
            values
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Application not found.' });
        }

        if (changedStatus && becameFinalStatus && studentId) {
            if (!hasNativeTrigger) {
                try {
                    await sendStudentNotification(connection, {
                        studentId,
                        notificationType: 'APPLICATION_STATUS',
                        title: `Application ${status}`,
                        message: `Your application for "${scholarshipTitle}" has been ${status.toLowerCase()} by the admin.`,
                        referenceType: 'application',
                        referenceId: id,
                        notificationKey: `application_status:${id}:${status.toLowerCase()}`,
                    });
                } catch (notifyError) {
                    console.error('Application status updated, but failed to enqueue student notification:', notifyError);
                }
            }

            try {
                await sendAdminNotification(connection, {
                    notificationType: 'APPLICATION_STATUS',
                    title: `Application #${id} ${status}`,
                    message: `Application #${id} for "${scholarshipTitle}" has been ${status.toLowerCase()}.`,
                    referenceType: 'application',
                    referenceId: id,
                    notificationKey: `application_decision:${id}:${status.toLowerCase()}`,
                });
            } catch (notifyError) {
                console.error('Application status updated, but failed to enqueue admin notification:', notifyError);
            }
        }

        res.status(200).json({ message: 'Application updated successfully.', status });
    } catch (error) {
        console.error('Failed to update application status:', error);
        res.status(500).json({ error: 'Failed to update application status.' });
    } finally {
        connection.release();
    }
};

/**
 * 4. Get scholarships for admin/frontend usage
 */
exports.getScholarships = async (_req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM scholarships ORDER BY id DESC');
        res.status(200).json(normalizeScholarshipRows(rows));
    } catch (error) {
        console.error('Failed to retrieve scholarships:', error);
        res.status(500).json({ error: 'Failed to retrieve scholarships.' });
    }
};

/**
 * 4b. Get only published scholarships for student listings
 */
exports.getPublishedScholarships = async (_req, res) => {
    const connection = await db.getConnection();

    try {
        const columns = await getTableColumns(connection, 'scholarships');
        const filters = [];

        if (columns.has('status')) {
            filters.push("status = 'published'");
        }
        if (columns.has('deadline')) {
            filters.push('deadline >= CURDATE()');
        }

        let sql = 'SELECT * FROM scholarships';
        if (filters.length > 0) {
            sql += ` WHERE ${filters.join(' AND ')}`;
        }

        if (columns.has('deadline')) {
            sql += ' ORDER BY deadline ASC, id DESC';
        } else {
            sql += ' ORDER BY id DESC';
        }

        const [rows] = await connection.query(sql);
        res.status(200).json(normalizeScholarshipRows(rows));
    } catch (error) {
        console.error('Failed to retrieve published scholarships:', error);
        res.status(500).json({ error: 'Failed to retrieve published scholarships.' });
    } finally {
        connection.release();
    }
};

/**
 * 4c. Publish/create scholarship from admin form
 */
exports.createScholarship = async (req, res) => {
    const rawTitle = (req.body?.title || '').toString().trim();
    const rawDescription = (req.body?.description || '').toString().trim();
    const rawDeadline = (req.body?.deadline || '').toString().trim();
    const requestedStatus = (req.body?.status || 'published').toString().trim().toLowerCase();

    if (!rawTitle) {
        return res.status(400).json({ error: 'Scholarship title is required.' });
    }

    if (!rawDescription) {
        return res.status(400).json({ error: 'Scholarship description is required.' });
    }

    if (requestedStatus && !SCHOLARSHIP_STATUSES.has(requestedStatus)) {
        return res.status(400).json({ error: 'Invalid scholarship status.' });
    }

    if (rawDeadline) {
        const parsedDeadline = new Date(`${rawDeadline}T00:00:00`);
        if (Number.isNaN(parsedDeadline.getTime())) {
            return res.status(400).json({ error: 'Invalid scholarship deadline.' });
        }
    }

    const minGpa = parseFiniteNumber(getScholarshipMinimumFromPayload(req.body), 1.0);
    if (minGpa < 1 || minGpa > 5) {
        return res.status(400).json({ error: 'Minimum GWA must be between 1.00 and 5.00.' });
    }

    const connection = await db.getConnection();

    try {
        const columns = await getTableColumns(connection, 'scholarships');
        const fields = ['title', 'description'];
        const values = [rawTitle, rawDescription];

        if (columns.has('deadline')) {
            if (!rawDeadline) {
                return res.status(400).json({ error: 'Scholarship deadline is required.' });
            }
            fields.push('deadline');
            values.push(rawDeadline);
        }

        const scholarshipMinimumColumn = getFirstExistingColumn(columns, SCHOLARSHIP_MINIMUM_KEYS);
        if (scholarshipMinimumColumn) {
            fields.push(scholarshipMinimumColumn);
            values.push(minGpa);
        }

        if (columns.has('fund_amount')) {
            fields.push('fund_amount');
            values.push(parseFiniteNumber(req.body?.fund_amount, 0));
        }

        if (columns.has('type')) {
            fields.push('type');
            values.push((req.body?.type || 'merit').toString().trim().toLowerCase());
        }

        if (columns.has('status')) {
            fields.push('status');
            values.push(requestedStatus || 'published');
        }

        if (columns.has('created_by_admin_id')) {
            const adminId = await resolveAdminId(connection, req.body?.admin_id);
            if (!adminId) {
                return res.status(500).json({ error: 'No admin profile found to attribute this scholarship.' });
            }
            fields.push('created_by_admin_id');
            values.push(adminId);
        }

        const placeholders = fields.map(() => '?').join(', ');
        const [result] = await connection.query(
            `INSERT INTO scholarships (${fields.join(', ')}) VALUES (${placeholders})`,
            values
        );

        const [insertedRows] = await connection.query(
            'SELECT * FROM scholarships WHERE id = ? LIMIT 1',
            [result.insertId]
        );

        const effectiveStatus = columns.has('status') ? (requestedStatus || 'published') : 'published';
        if (effectiveStatus === 'published') {
            try {
                await sendStudentNotification(connection, {
                    notificationType: 'NEW_SCHOLARSHIP',
                    title: `New Scholarship: ${rawTitle}`,
                    message: rawDeadline
                        ? `A new scholarship has been published. Deadline: ${rawDeadline}.`
                        : 'A new scholarship has been published. Check the portal for details.',
                    referenceType: 'scholarship',
                    referenceId: result.insertId,
                    notificationKey: `new_scholarship:${result.insertId}`,
                });
            } catch (notifyError) {
                console.error('Scholarship published, but failed to enqueue student notifications:', notifyError);
            }

            try {
                await sendAdminNotification(connection, {
                    notificationType: 'NEW_SCHOLARSHIP',
                    title: `Scholarship Published: ${rawTitle}`,
                    message: rawDeadline
                        ? `A scholarship was published with deadline ${rawDeadline}.`
                        : 'A scholarship was published and is now visible to students.',
                    referenceType: 'scholarship',
                    referenceId: result.insertId,
                    notificationKey: `admin_new_scholarship:${result.insertId}`,
                });
            } catch (notifyError) {
                console.error('Scholarship published, but failed to enqueue admin notifications:', notifyError);
            }
        }

        res.status(201).json({
            message: 'Scholarship published successfully.',
            scholarship: insertedRows[0] || null,
        });
    } catch (error) {
        console.error('Failed to create scholarship:', error);
        res.status(500).json({ error: 'Failed to publish scholarship.' });
    } finally {
        connection.release();
    }
};

/**
 * 4d. Remove scholarship and dependent records
 */
exports.removeScholarship = async (req, res) => {
    const scholarshipId = Number(req.params.id);
    if (!Number.isInteger(scholarshipId) || scholarshipId <= 0) {
        return res.status(400).json({ error: 'Invalid scholarship id.' });
    }

    const connection = await db.getConnection();
    let transactionStarted = false;
    let documentPaths = [];

    try {
        await connection.beginTransaction();
        transactionStarted = true;

        const [scholarshipRows] = await connection.query(
            'SELECT id, title FROM scholarships WHERE id = ? LIMIT 1',
            [scholarshipId]
        );

        if (scholarshipRows.length === 0) {
            await connection.rollback();
            transactionStarted = false;
            return res.status(404).json({ error: 'Scholarship not found.' });
        }

        const [applicationRows] = await connection.query(
            'SELECT id FROM applications WHERE scholarship_id = ?',
            [scholarshipId]
        );
        const applicationIds = applicationRows
            .map((row) => Number(row.id))
            .filter((value) => Number.isInteger(value) && value > 0);

        if (applicationIds.length > 0) {
            const inClause = buildInPlaceholders(applicationIds);

            if (await tableExists(connection, 'student_documents')) {
                const docColumns = await getTableColumns(connection, 'student_documents');

                if (docColumns.has('application_id')) {
                    if (docColumns.has('storage_path')) {
                        const [docRows] = await connection.query(
                            `SELECT storage_path FROM student_documents WHERE application_id IN (${inClause})`,
                            applicationIds
                        );
                        documentPaths = docRows.map((row) => row.storage_path).filter(Boolean);
                    }

                    await connection.query(
                        `DELETE FROM student_documents WHERE application_id IN (${inClause})`,
                        applicationIds
                    );
                }
            }

            if (await tableExists(connection, 'application_details')) {
                const detailColumns = await getTableColumns(connection, 'application_details');
                if (detailColumns.has('application_id')) {
                    await connection.query(
                        `DELETE FROM application_details WHERE application_id IN (${inClause})`,
                        applicationIds
                    );
                }
            }

            if (await tableExists(connection, 'application_status_history')) {
                const historyColumns = await getTableColumns(connection, 'application_status_history');
                if (historyColumns.has('application_id')) {
                    await connection.query(
                        `DELETE FROM application_status_history WHERE application_id IN (${inClause})`,
                        applicationIds
                    );
                }
            }

            if (await tableExists(connection, 'notifications')) {
                const notificationColumns = await getTableColumns(connection, 'notifications');
                const clauses = [];
                const values = [];

                if (notificationColumns.has('reference_type') && notificationColumns.has('reference_id')) {
                    clauses.push(`(reference_type = 'application' AND reference_id IN (${inClause}))`);
                    values.push(...applicationIds);
                }

                if (clauses.length > 0) {
                    await connection.query(
                        `DELETE FROM notifications WHERE ${clauses.join(' OR ')}`,
                        values
                    );
                }
            }

            await connection.query(
                'DELETE FROM applications WHERE scholarship_id = ?',
                [scholarshipId]
            );
        }

        if (await tableExists(connection, 'notifications')) {
            const notificationColumns = await getTableColumns(connection, 'notifications');
            const clauses = [];
            const values = [];

            if (notificationColumns.has('reference_type') && notificationColumns.has('reference_id')) {
                clauses.push('(reference_type = ? AND reference_id = ?)');
                values.push('scholarship', scholarshipId);
            }

            if (notificationColumns.has('dedupe_key')) {
                clauses.push('dedupe_key LIKE ?');
                values.push(`new_scholarship:${scholarshipId}%`);

                clauses.push('dedupe_key LIKE ?');
                values.push(`deadline_reminder:${scholarshipId}:%`);
            }

            if (clauses.length > 0) {
                await connection.query(
                    `DELETE FROM notifications WHERE ${clauses.join(' OR ')}`,
                    values
                );
            }
        }

        const [deleteScholarshipResult] = await connection.query(
            'DELETE FROM scholarships WHERE id = ?',
            [scholarshipId]
        );

        if (deleteScholarshipResult.affectedRows === 0) {
            await connection.rollback();
            transactionStarted = false;
            return res.status(404).json({ error: 'Scholarship not found.' });
        }

        await connection.commit();
        transactionStarted = false;

        await cleanupStoredDocumentPaths(documentPaths);

        res.status(200).json({
            message: 'Scholarship removed successfully.',
            scholarship_id: scholarshipId,
            scholarship_title: scholarshipRows[0].title,
            removed_applications: applicationIds.length,
        });
    } catch (error) {
        if (transactionStarted) {
            try {
                await connection.rollback();
            } catch {
                // ignore rollback secondary failures
            }
        }

        if (error?.code === 'ER_ROW_IS_REFERENCED_2' || error?.code === 'ER_ROW_IS_REFERENCED') {
            return res.status(409).json({
                error: 'Scholarship cannot be removed because related records still exist.',
            });
        }

        console.error('Failed to remove scholarship:', error);
        res.status(500).json({ error: 'Failed to remove scholarship.' });
    } finally {
        connection.release();
    }
};

/**
 * 5. Get student applications for tracker table
 */
exports.getStudentApplications = async (req, res) => {
    const studentId = (req.params?.student_id || '').toString().trim();

    if (!studentId) {
        return res.status(400).json({ error: 'Student id is required.' });
    }

    const connection = await db.getConnection();

    try {
        const hasStudentDocuments = await tableExists(connection, 'student_documents');
        const docColumns = hasStudentDocuments
            ? await getTableColumns(connection, 'student_documents')
            : new Set();

        let docsSelect = '';
        let docsJoin = '';
        if (hasStudentDocuments && docColumns.has('application_id')) {
            const docWhere = docColumns.has('is_active') ? 'WHERE is_active = 1' : '';
            docsSelect = ', COALESCE(sd.document_count, 0) AS document_count';
            docsJoin = `
                LEFT JOIN (
                    SELECT application_id, COUNT(*) AS document_count
                    FROM student_documents
                    ${docWhere}
                    GROUP BY application_id
                ) sd ON sd.application_id = a.id
            `;
        }

        const [rows] = await connection.query(`
            SELECT
                a.id AS application_id,
                a.scholarship_id,
                COALESCE(sch.title, 'Scholarship Record') AS scholarship_title,
                COALESCE(a.status, 'Pending') AS status,
                ${docsSelect ? 'COALESCE(sd.document_count, 0) AS document_count,' : ''}
                a.applied_at
            FROM applications a
            LEFT JOIN scholarships sch ON a.scholarship_id = sch.id
            ${docsJoin}
            WHERE a.student_id = ?
            ORDER BY a.applied_at DESC, a.id DESC
        `, [studentId]);

        const normalizedRows = rows.map((row) => ({
            ...row,
            status: getEffectiveApplicationStatus(row.status, row.document_count),
        }));

        res.status(200).json(normalizedRows);
    } catch (error) {
        console.error('Failed to retrieve student applications:', error);
        res.status(500).json({ error: 'Failed to retrieve your applications.' });
    } finally {
        connection.release();
    }
};

/**
 * 6. Get all uploaded documents for one student
 */
exports.getStudentDocuments = async (req, res) => {
    const { student_id: studentId } = req.params;
    const connection = await db.getConnection();

    try {
        const rows = await fetchDocumentRows(connection, 'student_id', studentId);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Failed to retrieve student documents:', error);
        res.status(500).json({ error: 'Failed to retrieve student documents.' });
    } finally {
        connection.release();
    }
};

/**
 * 7. Remove one uploaded document for one student
 */
exports.removeStudentDocument = async (req, res) => {
    const studentId = (req.params?.student_id || '').toString().trim();
    const documentId = Number(req.params?.document_id);

    if (!studentId) {
        return res.status(400).json({ error: 'Student id is required.' });
    }

    if (!Number.isInteger(documentId) || documentId <= 0) {
        return res.status(400).json({ error: 'Invalid document id.' });
    }

    const connection = await db.getConnection();
    let transactionStarted = false;

    try {
        if (!(await tableExists(connection, 'student_documents'))) {
            return res.status(404).json({ error: 'Document not found.' });
        }

        const docColumns = await getTableColumns(connection, 'student_documents');
        if (!docColumns.has('document_id') || !docColumns.has('student_id')) {
            return res.status(500).json({ error: 'Document table schema is missing required columns.' });
        }

        const selectColumns = ['document_id'];
        if (docColumns.has('storage_path')) {
            selectColumns.push('storage_path');
        }
        if (docColumns.has('application_id')) {
            selectColumns.push('application_id');
        }
        if (docColumns.has('document_type_code')) {
            selectColumns.push('document_type_code');
        }

        const whereParts = ['document_id = ?', 'student_id = ?'];
        const values = [documentId, studentId];

        if (docColumns.has('is_active')) {
            whereParts.push('is_active = 1');
        }

        const [docRows] = await connection.query(
            `SELECT ${selectColumns.join(', ')}
             FROM student_documents
             WHERE ${whereParts.join(' AND ')}
             LIMIT 1`,
            values
        );

        if (docRows.length === 0) {
            return res.status(404).json({ error: 'Document not found for this student.' });
        }

        const storagePath = docRows[0]?.storage_path || null;
        const parsedApplicationId = Number(docRows[0]?.application_id);
        const applicationId = Number.isInteger(parsedApplicationId) && parsedApplicationId > 0
            ? parsedApplicationId
            : null;

        // Legacy safety: some historical records may be detached from applications.
        // If application exists and is finalized, block edits. If missing, allow remove.
        if (applicationId) {
            let applicationRow = null;
            try {
                applicationRow = await getStudentApplicationForDocumentChange(connection, applicationId);
            } catch (error) {
                if (!(error instanceof HttpError && error.status === 404)) {
                    throw error;
                }
            }

            if (applicationRow && !isApplicationEditableForDocumentChanges(applicationRow.status)) {
                return res.status(409).json({
                    error: 'Documents are locked because this application has already been finalized.',
                });
            }
        }

        await connection.beginTransaction();
        transactionStarted = true;

        if (docColumns.has('is_active')) {
            await connection.query(
                'UPDATE student_documents SET is_active = 0 WHERE document_id = ? AND student_id = ?',
                [documentId, studentId]
            );
        } else {
            await connection.query(
                'DELETE FROM student_documents WHERE document_id = ? AND student_id = ?',
                [documentId, studentId]
            );
        }

        await connection.commit();
        transactionStarted = false;

        if (storagePath) {
            await cleanupStoredDocumentPaths([storagePath]);
        }

        res.status(200).json({
            message: 'Document removed successfully.',
            document_id: documentId,
            application_id: applicationId,
            document_type_code: docRows[0]?.document_type_code || null,
        });
    } catch (error) {
        if (transactionStarted) {
            try {
                await connection.rollback();
            } catch {
                // ignore rollback secondary failures
            }
        }

        if (error instanceof HttpError) {
            return res.status(error.status).json({ error: error.message });
        }

        console.error('Failed to remove student document:', error);
        res.status(500).json({ error: 'Failed to remove student document.' });
    } finally {
        connection.release();
    }
};

/**
 * 8. Remove one uploaded document for one application (admin action)
 */
exports.removeApplicationDocumentAsAdmin = async (req, res) => {
    const applicationId = Number(req.params?.application_id);
    const documentId = Number(req.params?.document_id);

    if (!Number.isInteger(applicationId) || applicationId <= 0) {
        return res.status(400).json({ error: 'Invalid application id.' });
    }

    if (!Number.isInteger(documentId) || documentId <= 0) {
        return res.status(400).json({ error: 'Invalid document id.' });
    }

    const connection = await db.getConnection();
    let transactionStarted = false;

    try {
        if (!(await tableExists(connection, 'student_documents'))) {
            return res.status(404).json({ error: 'Document not found.' });
        }

        const docColumns = await getTableColumns(connection, 'student_documents');
        if (!docColumns.has('document_id') || !docColumns.has('application_id')) {
            return res.status(500).json({ error: 'Document table schema is missing required columns.' });
        }

        const selectColumns = ['document_id', 'application_id'];
        if (docColumns.has('storage_path')) {
            selectColumns.push('storage_path');
        }
        if (docColumns.has('document_type_code')) {
            selectColumns.push('document_type_code');
        }

        const whereParts = ['document_id = ?', 'application_id = ?'];
        const whereValues = [documentId, applicationId];

        if (docColumns.has('is_active')) {
            whereParts.push('is_active = 1');
        }

        const [docRows] = await connection.query(
            `SELECT ${selectColumns.join(', ')}
             FROM student_documents
             WHERE ${whereParts.join(' AND ')}
             LIMIT 1`,
            whereValues
        );

        if (docRows.length === 0) {
            return res.status(404).json({ error: 'Document not found for this application.' });
        }

        const storagePath = docRows[0]?.storage_path || null;

        await connection.beginTransaction();
        transactionStarted = true;

        if (docColumns.has('is_active')) {
            await connection.query(
                'UPDATE student_documents SET is_active = 0 WHERE document_id = ? AND application_id = ?',
                [documentId, applicationId]
            );
        } else {
            await connection.query(
                'DELETE FROM student_documents WHERE document_id = ? AND application_id = ?',
                [documentId, applicationId]
            );
        }

        await connection.commit();
        transactionStarted = false;

        if (storagePath) {
            await cleanupStoredDocumentPaths([storagePath]);
        }

        res.status(200).json({
            message: 'Document removed successfully.',
            application_id: applicationId,
            document_id: documentId,
            document_type_code: docRows[0]?.document_type_code || null,
        });
    } catch (error) {
        if (transactionStarted) {
            try {
                await connection.rollback();
            } catch {
                // ignore rollback secondary failures
            }
        }

        console.error('Failed to remove application document:', error);
        res.status(500).json({ error: 'Failed to remove application document.' });
    } finally {
        connection.release();
    }
};

/**
 * 8. Upload one document replacement for one student application
 */
exports.uploadStudentDocumentForApplication = async (req, res) => {
    const studentId = (req.params?.student_id || '').toString().trim();
    const applicationId = Number(req.params?.application_id);
    const documentTypeCode = (req.body?.document_type_code || '').toString().trim().toLowerCase();
    const file = req.file || null;
    const uploadedStoragePath = file?.filename ? `/uploads/documents/${file.filename}` : null;

    if (!studentId) {
        if (uploadedStoragePath) await cleanupStoredDocumentPaths([uploadedStoragePath]);
        return res.status(400).json({ error: 'Student id is required.' });
    }

    if (!Number.isInteger(applicationId) || applicationId <= 0) {
        if (uploadedStoragePath) await cleanupStoredDocumentPaths([uploadedStoragePath]);
        return res.status(400).json({ error: 'Invalid application id.' });
    }

    if (!DOCUMENT_UPLOAD_META_BY_CODE.has(documentTypeCode)) {
        if (uploadedStoragePath) await cleanupStoredDocumentPaths([uploadedStoragePath]);
        return res.status(400).json({ error: 'Invalid document type.' });
    }

    if (!file) {
        return res.status(400).json({ error: 'Document file is required.' });
    }

    const ext = path.extname(file.originalname || '').toLowerCase();
    const allowedExt = DOCUMENT_ALLOWED_EXTENSIONS_BY_CODE.get(documentTypeCode);
    if (!allowedExt || !allowedExt.has(ext)) {
        if (uploadedStoragePath) await cleanupStoredDocumentPaths([uploadedStoragePath]);
        return res.status(400).json({ error: 'Invalid file type for this document category.' });
    }

    const connection = await db.getConnection();
    let transactionStarted = false;
    let shouldCleanupUploadedFile = true;

    try {
        const applicationRow = await getStudentApplicationForDocumentChange(connection, applicationId);
        const canModify = await canStudentModifyApplicationDocuments(connection, studentId, applicationRow, applicationId);
        if (!canModify) {
            throw new HttpError(404, 'Application not found for this student.');
        }

        if (!isApplicationEditableForDocumentChanges(applicationRow.status)) {
            throw new HttpError(409, 'Documents are locked because this application has already been finalized.');
        }

        await ensureDocumentSupportTables(connection);
        const docColumns = await getTableColumns(connection, 'student_documents');

        if (!docColumns.has('student_id') || !docColumns.has('application_id')) {
            throw new HttpError(500, 'Document table schema is missing required columns.');
        }

        const typeMap = docColumns.has('document_type_id') ? await getDocumentTypeMap(connection) : new Map();
        const documentMeta = DOCUMENT_UPLOAD_META_BY_CODE.get(documentTypeCode);

        await connection.beginTransaction();
        transactionStarted = true;

        const fields = ['student_id', 'application_id'];
        const values = [studentId, applicationId];

        if (docColumns.has('document_type_id')) {
            const typeInfo = typeMap.get(documentTypeCode);
            if (!typeInfo) {
                throw new HttpError(500, `Document type mapping missing for ${documentTypeCode}.`);
            }

            fields.push('document_type_id');
            values.push(typeInfo.id);
        }

        if (docColumns.has('document_type_code')) {
            fields.push('document_type_code');
            values.push(documentTypeCode);
        }

        if (docColumns.has('document_type_name')) {
            fields.push('document_type_name');
            values.push(documentMeta.name);
        }

        if (docColumns.has('original_filename')) {
            fields.push('original_filename');
            values.push(file.originalname || 'document');
        }

        if (docColumns.has('storage_path')) {
            fields.push('storage_path');
            values.push(uploadedStoragePath);
        }

        if (docColumns.has('mime_type')) {
            fields.push('mime_type');
            values.push(file.mimetype || null);
        }

        if (docColumns.has('file_size_bytes')) {
            fields.push('file_size_bytes');
            values.push(file.size || null);
        }

        if (docColumns.has('is_active')) {
            fields.push('is_active');
            values.push(1);
        }

        const placeholders = fields.map(() => '?').join(', ');
        const [insertResult] = await connection.query(
            `INSERT INTO student_documents (${fields.join(', ')}) VALUES (${placeholders})`,
            values
        );

        await connection.commit();
        transactionStarted = false;
        shouldCleanupUploadedFile = false;

        res.status(201).json({
            message: 'Document uploaded successfully.',
            document: {
                document_id: insertResult.insertId,
                application_id: applicationId,
                student_id: studentId,
                document_type_code: documentTypeCode,
                document_type_name: documentMeta.name,
                original_filename: file.originalname || 'document',
                storage_path: uploadedStoragePath,
                file_url: toFileUrl(uploadedStoragePath),
                mime_type: file.mimetype || null,
                file_size_bytes: file.size || null,
                uploaded_at: new Date().toISOString(),
            },
        });
    } catch (error) {
        if (transactionStarted) {
            try {
                await connection.rollback();
            } catch {
                // ignore rollback secondary failures
            }
        }

        if (shouldCleanupUploadedFile && uploadedStoragePath) {
            await cleanupStoredDocumentPaths([uploadedStoragePath]);
        }

        if (error instanceof HttpError) {
            return res.status(error.status).json({ error: error.message });
        }

        console.error('Failed to upload replacement document:', error);
        res.status(500).json({ error: 'Failed to upload document.' });
    } finally {
        connection.release();
    }
};

/**
 * 9. Get uploaded documents for one application (admin review)
 */
exports.getApplicationDocuments = async (req, res) => {
    const applicationId = Number(req.params.id);
    if (!Number.isFinite(applicationId)) {
        return res.status(400).json({ error: 'Invalid application id.' });
    }

    const connection = await db.getConnection();

    try {
        const rows = await fetchDocumentRows(connection, 'application_id', applicationId);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Failed to retrieve application documents:', error);
        res.status(500).json({ error: 'Failed to retrieve application documents.' });
    } finally {
        connection.release();
    }
};

/**
 * 9. Get notifications for one student (bell widget)
 */
exports.getStudentNotifications = async (req, res) => {
    const studentId = (req.params?.student_id || '').toString().trim();
    const requestedLimit = Number.parseInt(req.query?.limit, 10);
    const limit = Number.isInteger(requestedLimit) ? requestedLimit : 50;

    if (!studentId) {
        return res.status(400).json({ error: 'Student id is required.' });
    }

    const connection = await db.getConnection();

    try {
        const notifications = await fetchStudentNotifications(connection, studentId, limit);
        const unreadCount = notifications.filter((item) => !item.is_read).length;

        res.status(200).json({
            notifications,
            unread_count: unreadCount,
        });
    } catch (error) {
        console.error('Failed to retrieve student notifications:', error);
        res.status(500).json({ error: 'Failed to retrieve notifications.' });
    } finally {
        connection.release();
    }
};

/**
 * 10. Mark one student notification as read
 */
exports.markStudentNotificationRead = async (req, res) => {
    const notificationId = Number(req.params?.notification_id);
    const studentId = (req.body?.student_id || '').toString().trim();

    if (!Number.isInteger(notificationId) || notificationId <= 0) {
        return res.status(400).json({ error: 'Invalid notification id.' });
    }

    if (!studentId) {
        return res.status(400).json({ error: 'Student id is required.' });
    }

    const connection = await db.getConnection();

    try {
        const affectedRows = await markNotificationReadForStudent(connection, notificationId, studentId);
        if (affectedRows === 0) {
            return res.status(404).json({ error: 'Notification not found for this student.' });
        }

        res.status(200).json({ message: 'Notification marked as read.' });
    } catch (error) {
        console.error('Failed to mark notification as read:', error);
        res.status(500).json({ error: 'Failed to update notification.' });
    } finally {
        connection.release();
    }
};

/**
 * 11. Get notifications for one admin account
 */
exports.getAdminNotifications = async (req, res) => {
    const requestedAdminId = Number.parseInt(req.params?.admin_id, 10);
    const adminId = Number.isInteger(requestedAdminId) ? requestedAdminId : null;
    const requestedLimit = Number.parseInt(req.query?.limit, 10);
    const limit = Number.isInteger(requestedLimit) ? requestedLimit : 50;

    const connection = await db.getConnection();

    try {
        const notifications = await fetchAdminNotifications(connection, adminId, limit);
        const unreadCount = notifications.filter((item) => !item.is_read).length;

        res.status(200).json({
            notifications,
            unread_count: unreadCount,
        });
    } catch (error) {
        console.error('Failed to retrieve admin notifications:', error);
        res.status(500).json({ error: 'Failed to retrieve notifications.' });
    } finally {
        connection.release();
    }
};

/**
 * 12. Mark one admin notification as read
 */
exports.markAdminNotificationRead = async (req, res) => {
    const notificationId = Number(req.params?.notification_id);
    const adminId = Number.parseInt(req.body?.admin_id, 10);

    if (!Number.isInteger(notificationId) || notificationId <= 0) {
        return res.status(400).json({ error: 'Invalid notification id.' });
    }

    if (!Number.isInteger(adminId) || adminId <= 0) {
        return res.status(400).json({ error: 'Admin id is required.' });
    }

    const connection = await db.getConnection();

    try {
        const affectedRows = await markNotificationReadForAdmin(connection, notificationId, adminId);
        if (affectedRows === 0) {
            return res.status(404).json({ error: 'Notification not found for this admin.' });
        }

        res.status(200).json({ message: 'Notification marked as read.' });
    } catch (error) {
        console.error('Failed to mark admin notification as read:', error);
        res.status(500).json({ error: 'Failed to update notification.' });
    } finally {
        connection.release();
    }
};
