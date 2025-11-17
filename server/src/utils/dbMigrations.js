// src/utils/dbMigrations.js
const sql = require('mssql');

// يضمن وجود عمود ShowInCalendar في جدول Subtasks (آمن للتشغيل المتكرر)
async function ensureSubtasksCalendarFlag(pool) {
  const checkQuery = "SELECT COL_LENGTH('dbo.Subtasks', 'ShowInCalendar') AS Len";
  try {
    const check = await pool.request().query(checkQuery);
    const exists = !!(check.recordset && check.recordset[0] && check.recordset[0].Len);
    if (exists) {
      console.log('ℹ️ ShowInCalendar column already exists in Subtasks.');
      return { changed: false };
    }

    const alterQuery = `
      IF COL_LENGTH('dbo.Subtasks', 'ShowInCalendar') IS NULL
      BEGIN
          ALTER TABLE dbo.Subtasks ADD ShowInCalendar BIT NOT NULL CONSTRAINT DF_Subtasks_ShowInCalendar DEFAULT(0);
      END
    `;
    await pool.request().query(alterQuery);
    console.log('✅ Added ShowInCalendar column to Subtasks table.');
    return { changed: true };
  } catch (err) {
    console.error('❌ Failed ensuring ShowInCalendar column:', err);
    throw err;
  }
}

module.exports = {
  ensureSubtasksCalendarFlag,
  // يضمن وجود جدول أحداث التقويم الخاصة بالمستخدم (آمن للتشغيل المتكرر)
  ensurePersonalEventsTable: async function ensurePersonalEventsTable(pool) {
    try {
      const tableCheck = await pool.request().query(`
        SELECT COUNT(*) as tableExists 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_NAME = 'PersonalCalendarEvents'
      `);
      const exists = tableCheck.recordset[0].tableExists > 0;
      if (exists) {
        console.log('ℹ️ PersonalCalendarEvents table already exists.');
        return { changed: false };
      }

      const createQuery = `
        CREATE TABLE dbo.PersonalCalendarEvents (
          EventID INT IDENTITY(1,1) PRIMARY KEY,
          UserID NVARCHAR(50) NOT NULL,
          Title NVARCHAR(400) NOT NULL,
          EventDate DATE NOT NULL,
          CreatedAt DATETIME NOT NULL CONSTRAINT DF_PersonalCalendarEvents_CreatedAt DEFAULT(GETDATE())
        );
        CREATE INDEX IX_PersonalCalendarEvents_UserDate ON dbo.PersonalCalendarEvents(UserID, EventDate);
      `;
      await pool.request().query(createQuery);
      console.log('✅ Created PersonalCalendarEvents table.');
      return { changed: true };
    } catch (err) {
      console.error('❌ Failed ensuring PersonalCalendarEvents table:', err);
      throw err;
    }
  }
};