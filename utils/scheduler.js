const cron = require('node-cron');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const LOG_DIR = path.join(__dirname, '../logs');
const SYNC_STATUS_FILE = path.join(LOG_DIR, 'last_sync.json');
const SYNC_LOG_FILE = path.join(LOG_DIR, 'sync.log');

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Logger utility: writes to console and file with timestamp
function log(message) {
  const timestamp = new Date().toISOString();
  const formattedMessage = `[${timestamp}] ${message}`;
  fs.appendFileSync(SYNC_LOG_FILE, formattedMessage + '\n');
  console.log(formattedMessage);
}

// Update sync timestamps file atomically
function updateSyncTimestamps() {
  const now = new Date().toISOString();
  const syncStatus = {
    last_sync_employees: now,
    last_sync_attendance: now,
  };
  try {
    fs.writeFileSync(SYNC_STATUS_FILE, JSON.stringify(syncStatus, null, 2));
  } catch (err) {
    log(`ERROR writing sync status file: ${err.message}`);
  }
}

// Retry helper with exponential backoff for axios requests
async function axiosWithRetry(url, options = {}, retries = 3, delay = 1000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await axios(url, options);
    } catch (err) {
      if (attempt === retries) throw err;
      log(`Warning: Attempt ${attempt} failed for ${url} - retrying in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
      delay *= 2; // Exponential backoff
    }
  }
}

function buildUrl(base, port, path) {
  return `${base}:${port}${path}`;
}

async function performSync() {
  try {
    log('Starting sync process...');

    const baseUrl = process.env.API_BASE_URL || 'http://localhost';

    // Build URLs by concatenating base URL, ports, and paths
    const employeeUrl = buildUrl(baseUrl, process.env.PORT, '/api/mock/timespring/employees');
    const attendanceUrl = buildUrl(baseUrl, process.env.PORT, '/api/mock/timespring/attendance');
    const syncEmployeesUrl = buildUrl(baseUrl, process.env.PORT, '/api/v1/sync/employees');
    const syncAttendanceUrl = buildUrl(baseUrl, process.env.PORT, '/api/v1/sync/clock');

    // Fetch data concurrently with retry
    const [empRes, attRes] = await Promise.all([
      axiosWithRetry(employeeUrl, { method: 'GET' }),
      axiosWithRetry(attendanceUrl, { method: 'GET' }),
    ]);

    // Post data concurrently with retry
    await Promise.all([
      axiosWithRetry(syncEmployeesUrl, { method: 'POST', data: { employees: empRes.data.employees } }),
      axiosWithRetry(syncAttendanceUrl, { method: 'POST', data: { attendance_records: attRes.data.attendance_records } }),
    ]);

    updateSyncTimestamps();
    log('Sync completed successfully.');
  } catch (error) {
    log(`ERROR during sync: ${error.message}`);
  }
}


module.exports = function startScheduler() {
  // Runs at minute 0 every hour (e.g. 01:00, 02:00)
  cron.schedule('0 * * * *', () => {
    performSync();
  });

  log('Sync scheduler started. Running every hour at minute 0.');
};
