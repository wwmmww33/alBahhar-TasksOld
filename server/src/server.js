// src/server.js
const express = require('express');
const path = require('path');
const fs = require('fs');
const sql = require('mssql');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 5001;

// --- Middlewares ---
app.use(cors());
app.use(express.json());

// تهيئة خدمة الملفات الثابتة للواجهة الأمامية (dist) بمسارات احتياطية مرنة
const candidateStaticDirs = [
  process.env.STATIC_DIR && path.resolve(process.env.STATIC_DIR),
  path.join(__dirname, '..', 'dist'),
  path.join(__dirname, '..', 'client', 'dist'),
  path.resolve(process.cwd(), 'dist'),
].filter(Boolean);

let distDir = candidateStaticDirs.find((dir) => {
  try {
    return fs.existsSync(dir) && fs.existsSync(path.join(dir, 'index.html'));
  } catch {
    return false;
  }
});

if (!distDir) {
  // إذا لم نعثر على مجلد dist، استخدم أول مرشح كافتراضي (قد يؤدي إلى 404)
  distDir = candidateStaticDirs[0];
}

console.log('📦 Static frontend directory:', distDir);
app.use(express.static(distDir));


// --- 1. استيراد كل ملفات التوجيه (Routes) ---
const authRoutes = require('./routes/authRoutes');
const taskRoutes = require('./routes/taskRoutes');
const subtaskRoutes = require('./routes/subtaskRoutes');
const commentRoutes = require('./routes/commentRoutes');
const procedureRoutes = require('./routes/procedureRoutes');
const departmentRoutes = require('./routes/departmentRoutes');
const userRoutes = require('./routes/userRoutes');
const profileRoutes = require('./routes/profileRoutes');
const commentNotificationRoutes = require('./routes/commentNotificationRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const calendarRoutes = require('./routes/calendarRoutes');
const { ensureSubtasksCalendarFlag, ensurePersonalEventsTable } = require('./utils/dbMigrations');


// --- 2. تسجيل كل مسارات الـ API ---
// (يجب أن يكون هذا الجزء قبل المسار الشامل '*')
app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/subtasks', subtaskRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/procedures', procedureRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/users', userRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/comment-notifications', commentNotificationRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/calendar', calendarRoutes);


// --- 3. المسار الشامل (Catch-all) يجب أن يكون هو الأخير دائماً ---
// إعادة تفعيل مسار SPA لإرجاع index.html لأي طلب غير API
app.get('*', (req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});


// --- 4. بدء تشغيل الخادم ---
const startServer = async () => {
  try {
    const dbConfig = require('./config/db.config');
    const pool = await new sql.ConnectionPool(dbConfig).connect();
    app.locals.db = pool;
    
    console.log('✅ Connected to SQL Server successfully!');

    // --- تشغيل ترحيل آمن لضمان عمود ShowInCalendar ---
    try {
      await ensureSubtasksCalendarFlag(pool);
    } catch (migrationErr) {
      console.error('⚠️ Database migration (ShowInCalendar) failed. Server continues running.', migrationErr);
    }
    // --- تشغيل ترحيل آمن لإنشاء جدول الأحداث الخاصة إذا لم يوجد ---
    try {
      await ensurePersonalEventsTable(pool);
    } catch (eventsMigrationErr) {
      console.error('⚠️ Database migration (PersonalCalendarEvents) failed. Server continues running.', eventsMigrationErr);
    }
    
    app.listen(port, '0.0.0.0', () => {
      console.log(`🚀 Server is running on http://0.0.0.0:${port}`);
      console.log(`🌐 Access from network: http://<your-ip>:${port}`);
    });

  } catch (err) {
    console.error('❌ Database Connection Failed!', err);
    process.exit(1); // إيقاف التطبيق إذا فشل الاتصال بقاعدة البيانات
  }
};

startServer();