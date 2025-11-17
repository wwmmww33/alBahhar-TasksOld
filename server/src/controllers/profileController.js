// src/controllers/profileController.js
const sql = require('mssql');

// تحديث الملف الشخصي للمستخدم
exports.updateProfile = async (req, res) => {
    const pool = req.app.locals.db;
    const { UserID, FullName, DepartmentID, PasswordHash, CurrentPassword } = req.body;

    if (!pool) {
        return res.status(503).send({ message: 'Database connection is not available.' });
    }

    if (!UserID || !FullName) {
        return res.status(400).json({ message: 'UserID and FullName are required.' });
    }

    try {
        // إذا كان المستخدم يريد تغيير كلمة المرور، نتحقق من كلمة المرور الحالية
        if (PasswordHash) {
            if (!CurrentPassword) {
                return res.status(400).json({ message: 'Current password is required to change password.' });
            }

            // التحقق من كلمة المرور الحالية
            const currentUserResult = await pool.request()
                .input('UserID', sql.NVarChar, UserID)
                .query('SELECT PasswordHash FROM Users WHERE UserID = @UserID');

            const currentUser = currentUserResult.recordset[0];
            if (!currentUser) {
                return res.status(404).json({ message: 'User not found.' });
            }

            if (CurrentPassword !== currentUser.PasswordHash) {
                return res.status(401).json({ message: 'Current password is incorrect.' });
            }
        }

        // بناء استعلام التحديث
        let query = 'UPDATE Users SET FullName = @FullName, DepartmentID = @DepartmentID';
        const request = pool.request()
            .input('UserID', sql.NVarChar, UserID)
            .input('FullName', sql.NVarChar, FullName)
            .input('DepartmentID', sql.Int, DepartmentID);

        // إضافة تحديث كلمة المرور إذا تم توفيرها
        if (PasswordHash) {
            query += ', PasswordHash = @PasswordHash';
            request.input('PasswordHash', sql.NVarChar, PasswordHash);
        }

        query += ' WHERE UserID = @UserID';
        
        await request.query(query);

        // جلب البيانات المحدثة مع اسم القسم
        const updatedUserResult = await pool.request()
            .input('UserID', sql.NVarChar, UserID)
            .query(`
                SELECT u.UserID, u.FullName, u.DepartmentID, d.Name as DepartmentName, u.IsAdmin
                FROM Users u 
                LEFT JOIN Departments d ON u.DepartmentID = d.DepartmentID 
                WHERE u.UserID = @UserID
            `);

        const updatedUser = updatedUserResult.recordset[0];
        if (!updatedUser) {
            return res.status(404).json({ message: 'User not found after update.' });
        }

        res.status(200).json({ 
            message: 'Profile updated successfully',
            user: updatedUser
        });

    } catch (error) {
        console.error('UPDATE PROFILE ERROR:', error);
        res.status(500).send({ message: 'Error updating profile' });
    }
};

// جلب معلومات الملف الشخصي
exports.getProfile = async (req, res) => {
    const pool = req.app.locals.db;
    const { userId } = req.params;

    if (!pool) {
        return res.status(503).send({ message: 'Database connection is not available.' });
    }

    try {
        const result = await pool.request()
            .input('UserID', sql.NVarChar, userId)
            .query(`
                SELECT u.UserID, u.FullName, u.DepartmentID, d.Name as DepartmentName, u.IsAdmin
                FROM Users u 
                LEFT JOIN Departments d ON u.DepartmentID = d.DepartmentID 
                WHERE u.UserID = @UserID AND u.IsActive = 1
            `);

        const user = result.recordset[0];
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        res.status(200).json(user);

    } catch (error) {
        console.error('GET PROFILE ERROR:', error);
        res.status(500).send({ message: 'Error fetching profile' });
    }
};