-- Add ShowInCalendar flag to Subtasks table (idempotent)
IF COL_LENGTH('dbo.Subtasks', 'ShowInCalendar') IS NULL
BEGIN
    ALTER TABLE dbo.Subtasks ADD ShowInCalendar BIT NOT NULL CONSTRAINT DF_Subtasks_ShowInCalendar DEFAULT(0);
END

-- Optional future: note for calendar item
-- IF COL_LENGTH('dbo.Subtasks', 'CalendarNote') IS NULL
-- BEGIN
--     ALTER TABLE dbo.Subtasks ADD CalendarNote NVARCHAR(255) NULL;
-- END