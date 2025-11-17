const sql = require('mssql');
exports.getAllDepartments = async (req, res) => {
    const pool = req.app.locals.db;
    try {
        const result = await pool.request().query('SELECT * FROM Departments ORDER BY Name');
        res.status(200).json(result.recordset);
    } catch (error) { res.status(500).send({ message: 'Error fetching departments' }); }
};
exports.createDepartment = async (req, res) => {
    const pool = req.app.locals.db;
    const { Name } = req.body;
    try {
        const result = await pool.request().input('Name', sql.NVarChar, Name).query('INSERT INTO Departments (Name) OUTPUT INSERTED.* VALUES (@Name)');
        res.status(201).json(result.recordset[0]);
    } catch (error) { res.status(500).send({ message: 'Error creating department' }); }
};
exports.updateDepartment = async (req, res) => {
    const pool = req.app.locals.db;
    const { id } = req.params;
    const { Name } = req.body;
    try {
        await pool.request().input('DepartmentID', sql.Int, id).input('Name', sql.NVarChar, Name).query('UPDATE Departments SET Name = @Name WHERE DepartmentID = @DepartmentID');
        res.status(200).json({ message: 'Department updated successfully' });
    } catch (error) { res.status(500).send({ message: 'Error updating department' }); }
};
exports.deleteDepartment = async (req, res) => {
    const pool = req.app.locals.db;
    const { id } = req.params;
    try {
        await pool.request().input('DepartmentID', sql.Int, id).query('DELETE FROM Departments WHERE DepartmentID = @DepartmentID');
        res.status(200).json({ message: 'Department deleted successfully' });
    } catch (error) {
        if (error.number === 547) { return res.status(400).send({ message: 'Cannot delete department. It is assigned to users.' }); }
        res.status(500).send({ message: 'Error deleting department' });
    }
};
