// src/controllers/authController.js
const sql = require('mssql');

// في authController.js

// في authController.js

exports.login = async (req, res) => {
    const pool = req.app.locals.db;
    const { userId, password } = req.body;

    // --- تحقق إضافي ---
    if (!pool) {
        return res.status(503).send({ message: 'Database connection is not available.' });
    }

    if (!userId || !password) {
        return res.status(400).json({ message: 'Username and password are required.' });
    }

    try {
        const result = await pool.request() // <-- الآن pool مضمون أنه موجود
            .input('UserID', sql.NVarChar, userId)
            .query(`SELECT u.*, d.Name as DepartmentName FROM Users u LEFT JOIN Departments d ON u.DepartmentID = d.DepartmentID WHERE u.UserID = @UserID`);

        const user = result.recordset[0];

        if (!user) { return res.status(404).json({ message: 'المستخدم غير موجود.' }); }
        if (!user.IsActive) { return res.status(403).json({ message: 'هذا الحساب موقوف.' }); }
        if (password !== user.PasswordHash) { return res.status(401).json({ message: 'كلمة المرور غير صحيحة.' }); }
        
        const { PasswordHash, ...userWithoutPassword } = user;
        res.status(200).json({ message: 'Login successful', user: userWithoutPassword });

    } catch (error) {
        console.error("LOGIN ERROR:", error);
        res.status(500).send({ message: 'Server error during login' });
    }
};
exports.registerRequest = async (req, res) => {
    const pool = req.app.locals.db;
    const { userId, password, fullName, departmentId } = req.body;
    try {
        await pool.request()
            .input('UserID', sql.NVarChar, userId)
            .input('PasswordHash', sql.NVarChar, password) // تذكر: يجب استخدام Hashing هنا
            .input('FullName', sql.NVarChar, fullName)
            .input('DepartmentID', sql.Int, departmentId)
            .query('INSERT INTO RegistrationRequests (UserID, PasswordHash, FullName, DepartmentID) VALUES (@UserID, @PasswordHash, @FullName, @DepartmentID)');
        res.status(201).json({ message: 'Registration request submitted successfully. Waiting for admin approval.' });
    } catch (error) { res.status(500).send({ message: 'Failed to submit registration request' }); }
};