// src/scripts/backfill.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sql = require('mssql');
const dbConfig = require('../config/db.config');
const encryptionConfig = require('../config/encryption.config');

// إعدادات عامة
const BASE_LOG_DIR = process.env.BACKFILL_LOG_DIR
  ? path.resolve(process.env.BACKFILL_LOG_DIR)
  : (process.pkg
      ? path.join(process.cwd(), 'backfill_logs')
      : path.join(__dirname, '..', '..', 'backfill_logs'));
const LOGS_DIR = BASE_LOG_DIR;
const DEFAULT_BATCH_SIZE = parseInt(process.env.BACKFILL_BATCH_SIZE || '500', 10);

function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
}

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    d.getFullYear() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) + '_' +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

function createLogFileName() {
  return path.join(LOGS_DIR, `backfill_${timestamp()}.json`);
}

function writeLogFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function readLatestLogFile() {
  ensureLogsDir();
  const files = fs.readdirSync(LOGS_DIR)
    .filter(f => f.startsWith('backfill_') && f.endsWith('.json'))
    .sort((a, b) => b.localeCompare(a));
  if (!files.length) {
    throw new Error('No backfill log files found.');
  }
  const latestPath = path.join(LOGS_DIR, files[0]);
  const content = fs.readFileSync(latestPath, 'utf-8');
  return { path: latestPath, data: JSON.parse(content) };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const modeArg = args.find(a => a.startsWith('--mode'));
  const batchArg = args.find(a => a.startsWith('--batch'));
  const logArg = args.find(a => a.startsWith('--log'));
  const dryArg = args.find(a => a === '--dry-run');

  const mode = modeArg ? modeArg.split('=')[1] : 'encrypt';
  const batchSize = batchArg ? parseInt(batchArg.split('=')[1], 10) : DEFAULT_BATCH_SIZE;
  const logFile = logArg ? logArg.split('=')[1] : null;
  const dryRun = !!dryArg;
  return { mode, batchSize, logFile, dryRun };
}

function needsEncryption(value) {
  if (value === null || value === undefined) return false;
  if (typeof value !== 'string') value = String(value);
  const trimmed = value.trim();
  if (!trimmed) return false;
  // إذا لم يحتوِ النص على علامة النسخة | نعتبره نصًا عاديًا يحتاج لتشفير
  return trimmed.indexOf('|') === -1;
}

async function processBatch(pool, table, pkField, valueField, nvarcharType, pkType, offset, batchSize, whereClause, updatesLog, dryRun) {
  const whereSql = whereClause ? `WHERE ${whereClause}` : '';
  const query = `SELECT ${pkField} AS id, ${valueField} AS val FROM ${table} ${whereSql} ORDER BY ${pkField} OFFSET @offset ROWS FETCH NEXT @batch ROWS ONLY;`;
  const rs = await pool.request()
    .input('offset', sql.Int, offset)
    .input('batch', sql.Int, batchSize)
    .query(query);

  const rows = rs.recordset || [];
  if (!rows.length) return { done: true, count: 0 };

  const candidates = rows.filter(r => r.val !== null && r.val !== undefined);

  if (dryRun) {
    const toEncryptCount = candidates.reduce((acc, r) => acc + (needsEncryption(r.val) ? 1 : 0), 0);
    console.log(`[DRY] ${table} batch offset=${offset} size=${rows.length}: need_encrypt=${toEncryptCount}`);
    return { done: false, count: rows.length };
  }

  const tx = new sql.Transaction(pool);
  await tx.begin();
  let updatedCount = 0;
  try {
    for (const row of candidates) {
      if (!needsEncryption(row.val)) continue;
      const encrypted = encryptionConfig.encrypt(row.val);
      const req = new sql.Request(tx);
      req.input('value', nvarcharType, encrypted);
      req.input('id', pkType, row.id);
      await req.query(`UPDATE ${table} SET ${valueField} = @value WHERE ${pkField} = @id;`);
      updatesLog.push({ table, pkField, pkValue: row.id, column: valueField, op: 'encrypt', ts: new Date().toISOString() });
      updatedCount++;
    }
    await tx.commit();
  } catch (err) {
    console.error(`[ERROR] Failed updating ${table} batch at offset=${offset}:`, err.message);
    try { await tx.rollback(); } catch (_) {}
    throw err;
  }

  console.log(`[OK] ${table} batch offset=${offset} updated=${updatedCount}`);
  return { done: false, count: rows.length };
}

async function backfillTable(pool, opts) {
  const { table, pkField, valueField, nvarcharType, pkType = sql.Int, whereClause = null, batchSize, updatesLog, dryRun } = opts;
  console.log(`Starting backfill for ${table}.${valueField} ...`);
  let offset = 0;
  while (true) {
    const { done, count } = await processBatch(
      pool,
      table,
      pkField,
      valueField,
      nvarcharType,
      pkType,
      offset,
      batchSize,
      whereClause,
      updatesLog,
      dryRun
    );
    if (done) break;
    offset += count; // التنقل عبر الجدول بالكامل
  }
  console.log(`Completed backfill for ${table}.${valueField}`);
}

async function backfillAll(pool, batchSize, dryRun) {
  ensureLogsDir();
  const logFilePath = createLogFileName();
  const updatesLog = [];

  // ملاحظة الأمن: لا نقوم بتسجيل القيم الحساسة نفسها، فقط المفاتيح الأساسية والعمود والعملية
  // الجداول المستهدفة
  await backfillTable(pool, {
    table: 'Categories', pkField: 'CategoryID', valueField: 'Description', nvarcharType: sql.NVarChar(500), whereClause: 'Description IS NOT NULL', batchSize, updatesLog, dryRun
  });
  await backfillTable(pool, {
    table: 'Tasks', pkField: 'TaskID', valueField: 'Description', nvarcharType: sql.NVarChar, whereClause: 'Description IS NOT NULL', batchSize, updatesLog, dryRun
  });
  await backfillTable(pool, {
    table: 'Tasks', pkField: 'TaskID', valueField: 'Title', nvarcharType: sql.NVarChar(sql.MAX), whereClause: 'Title IS NOT NULL', batchSize, updatesLog, dryRun
  });
  await backfillTable(pool, {
    table: 'Subtasks', pkField: 'SubtaskID', valueField: 'Title', nvarcharType: sql.NVarChar(sql.MAX), whereClause: 'Title IS NOT NULL', batchSize, updatesLog, dryRun
  });
  await backfillTable(pool, {
    table: 'Comments', pkField: 'CommentID', valueField: 'Content', nvarcharType: sql.NVarChar, whereClause: 'Content IS NOT NULL', batchSize, updatesLog, dryRun
  });
  await backfillTable(pool, {
    table: 'CategoryInformation', pkField: 'InfoID', valueField: 'Content', nvarcharType: sql.NVarChar(sql.MAX), whereClause: 'Content IS NOT NULL', batchSize, updatesLog, dryRun
  });
  await backfillTable(pool, {
    table: 'Procedures', pkField: 'ProcedureID', valueField: 'Title', nvarcharType: sql.NVarChar(sql.MAX), whereClause: 'Title IS NOT NULL', batchSize, updatesLog, dryRun
  });
  await backfillTable(pool, {
    table: 'ProcedureSubtasks', pkField: 'ProcedureSubtaskID', valueField: 'Title', nvarcharType: sql.NVarChar(sql.MAX), whereClause: 'Title IS NOT NULL', batchSize, updatesLog, dryRun
  });
  await backfillTable(pool, {
    table: 'PersonalCalendarEvents', pkField: 'EventID', valueField: 'Title', nvarcharType: sql.NVarChar(sql.MAX), whereClause: 'Title IS NOT NULL', batchSize, updatesLog, dryRun
  });
  await backfillTable(pool, {
    table: 'Users', pkField: 'UserID', valueField: 'PasswordHash', nvarcharType: sql.NVarChar(sql.MAX), pkType: sql.NVarChar(50), whereClause: 'PasswordHash IS NOT NULL', batchSize, updatesLog, dryRun
  });
  await backfillTable(pool, {
    table: 'RegistrationRequests', pkField: 'RequestID', valueField: 'PasswordHash', nvarcharType: sql.NVarChar(sql.MAX), whereClause: 'PasswordHash IS NOT NULL', batchSize, updatesLog, dryRun
  });

  const resultSummary = { mode: 'encrypt', startedAt: new Date().toISOString(), batchSize, dryRun, updates: updatesLog };
  if (!dryRun) {
    writeLogFile(logFilePath, resultSummary);
    console.log(`Backfill log written to: ${logFilePath}`);
  } else {
    console.log(`[DRY] Backfill summary: updates=${updatesLog.length}`);
  }
}

async function rollbackFromLog(pool, logFilePath) {
  ensureLogsDir();
  const { path: latestPath, data } = logFilePath ? { path: logFilePath, data: JSON.parse(fs.readFileSync(logFilePath, 'utf-8')) } : readLatestLogFile();
  if (!data || !Array.isArray(data.updates)) {
    throw new Error('Invalid log file format: missing updates array');
  }
  const updates = data.updates;
  console.log(`Starting rollback using log: ${logFilePath || latestPath} (entries=${updates.length})`);

  // نجري rollback على شكل معاملات صغيرة لكل جدول لتقليل المخاطر
  const groupByTable = updates.reduce((acc, u) => {
    const k = `${u.table}|${u.pkField}|${u.column}`;
    acc[k] = acc[k] || [];
    acc[k].push(u);
    return acc;
  }, {});

  let reverted = 0;
  for (const key of Object.keys(groupByTable)) {
    const [table, pkField, column] = key.split('|');
    const entries = groupByTable[key];
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      for (const e of entries) {
        const sel = await new sql.Request(tx)
          .input('id', sql.Int, e.pkValue)
          .query(`SELECT ${column} AS val FROM ${table} WHERE ${pkField} = @id;`);
        const row = sel.recordset[0];
        if (!row) continue;
        const val = row.val;
        // إذا كانت القيمة مشفرة حاليًا، فكها لنستعيد النص الأصلي
        let plain;
        try {
          plain = encryptionConfig.decrypt(val);
        } catch (_) {
          // ليست مشفرة أو فشل فك التشفير -> تخطى هذا السجل
          continue;
        }
        await new sql.Request(tx)
          .input('value', sql.NVarChar(sql.MAX), plain)
          .input('id', sql.Int, e.pkValue)
          .query(`UPDATE ${table} SET ${column} = @value WHERE ${pkField} = @id;`);
        reverted++;
      }
      await tx.commit();
    } catch (err) {
      console.error(`[ERROR] Rollback failed for ${table}.${column}:`, err.message);
      try { await tx.rollback(); } catch (_) {}
      throw err;
    }
  }

  console.log(`Rollback completed. Reverted rows: ${reverted}`);
}

(async function main() {
  const { mode, batchSize, logFile, dryRun } = parseArgs();
  console.log(`Backfill script starting. mode=${mode} batchSize=${batchSize} dryRun=${dryRun}`);

  let pool;
  try {
    pool = await new sql.ConnectionPool(dbConfig).connect();
    if (mode === 'encrypt') {
      await backfillAll(pool, batchSize, dryRun);
    } else if (mode === 'rollback') {
      await rollbackFromLog(pool, logFile || null);
    } else {
      console.error(`Unknown mode: ${mode}. Use --mode encrypt | rollback`);
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('Backfill script error:', err);
    process.exitCode = 1;
  } finally {
    if (pool) {
      try { await pool.close(); } catch (_) {}
    }
  }
})();
