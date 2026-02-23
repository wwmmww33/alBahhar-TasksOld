// src/controllers/userController.js
const sql = require('mssql');
const encryptionConfig = require('../config/encryption.config');

// ... (getAllUsers و updateUser تبقى كما هي) ...
// في userController.js

exports.getAllUsers = async (req, res) => {
    const pool = req.app.locals.db;
    try {
        const result = await pool.request().query(`
            SELECT 
                u.UserID, 
                u.FullName, 
                u.DepartmentID, 
                d.Name as DepartmentName, 
                u.IsActive
            FROM 
                Users u
            LEFT JOIN 
                Departments d ON u.DepartmentID = d.DepartmentID
            ORDER BY 
                u.FullName;
        `);
        console.log(`Found ${result.recordset.length} users.`); // <-- رسالة تشخيصية
        res.status(200).json(result.recordset);
    } catch (error) { 
        console.error("DATABASE GET USERS ERROR:", error); // <-- رسالة تشخيصية
        res.status(500).send({ message: 'Error fetching users' }); 
    }
};
exports.updateUser = async (req, res) => {
    const pool = req.app.locals.db;
    const { id } = req.params; // UserID القديم
    const { FullName, DepartmentID, PasswordHash, IsActive } = req.body;

    // التحقق من أن IsActive هي قيمة منطقية
    if (typeof IsActive !== 'boolean') {
        return res.status(400).json({ message: 'IsActive must be a boolean.' });
    }

    try {
        let query = 'UPDATE Users SET FullName = @FullName, DepartmentID = @DepartmentID, IsActive = @IsActive';
        const request = pool.request()
            .input('UserID', sql.NVarChar, id)
            .input('FullName', sql.NVarChar, FullName)
            .input('DepartmentID', sql.Int, DepartmentID)
            .input('IsActive', sql.Bit, IsActive);
        
        // تحديث كلمة المرور فقط إذا تم إرسال كلمة مرور جديدة (غير فارغة)
        if (PasswordHash && PasswordHash.length > 0) {
            const hashed = encryptionConfig.hashPassword(PasswordHash).combined;
            query += ', PasswordHash = @PasswordHash';
            request.input('PasswordHash', sql.NVarChar, hashed);
        }
        
        query += ' WHERE UserID = @UserID';
        await request.query(query);

        res.status(200).json({ message: 'User updated successfully' });
    } catch (error) {
        console.error("UPDATE USER ERROR:", error);
        res.status(500).send({ message: 'Error updating user' });
    }
};
// --- الدوال التي سنقوم بملئها الآن ---

// جلب كل طلبات التسجيل المعلقة
exports.getRegistrationRequests = async (req, res) => {
    const pool = req.app.locals.db;
    try {
        const result = await pool.request().query(`
            SELECT r.RequestID, r.UserID, r.FullName, r.DepartmentID, d.Name as DepartmentName 
            FROM RegistrationRequests r
            JOIN Departments d ON r.DepartmentID = d.DepartmentID
            WHERE r.Status = 'Pending'
            ORDER BY r.RequestDate DESC
        `);
        res.status(200).json(result.recordset);
    } catch (error) { res.status(500).send({ message: 'Error fetching registration requests' }); }
};

// الموافقة على طلب تسجيل
exports.approveRegistrationRequest = async (req, res) => {
    const pool = req.app.locals.db;
    const { id } = req.params; // RequestID
    const transaction = new sql.Transaction(pool);
    try {
        await transaction.begin();
        const requestResult = await new sql.Request(transaction).input('RequestID', sql.Int, id).query('SELECT * FROM RegistrationRequests WHERE RequestID = @RequestID AND Status = \'Pending\'');
        const requestData = requestResult.recordset[0];
        if (!requestData) {
            await transaction.rollback();
            return res.status(404).json({ message: 'Request not found or already processed.' });
        }
        await new sql.Request(transaction)
            .input('UserID', sql.NVarChar, requestData.UserID)
            .input('PasswordHash', sql.NVarChar, requestData.PasswordHash)
            .input('FullName', sql.NVarChar, requestData.FullName)
            .input('DepartmentID', sql.Int, requestData.DepartmentID)
            .query('INSERT INTO Users (UserID, PasswordHash, FullName, DepartmentID, IsActive) VALUES (@UserID, @PasswordHash, @FullName, @DepartmentID, 1)');
        await new sql.Request(transaction).input('RequestID', sql.Int, id).query("UPDATE RegistrationRequests SET Status = 'Approved' WHERE RequestID = @RequestID");
        await transaction.commit();
        res.status(200).json({ message: 'User approved and created successfully.' });
    } catch (error) {
        await transaction.rollback();
        // التعامل مع خطأ اسم المستخدم المكرر
        if (error.number === 2627) {
            return res.status(409).send({ message: 'User with this ID already exists.'});
        }
        res.status(500).send({ message: 'Failed to approve request.' });
    }
};
