const fs = require('fs');
const path = require('path');
const os = require('os');

const syncStatusFile = path.join(__dirname, '../logs/last_sync.json');

function getLastSyncStatus() {
  if (!fs.existsSync(syncStatusFile)) {
    return {
      last_sync_employees: null,
      last_sync_attendance: null
    };
  }
  const data = JSON.parse(fs.readFileSync(syncStatusFile, 'utf-8'));
  return {
    last_sync_employees: data.last_sync_employees || null,
    last_sync_attendance: data.last_sync_attendance || null
  };
}

function updateLastSyncStatus(type) {
  let data = {};
  if (fs.existsSync(syncStatusFile)) {
    data = JSON.parse(fs.readFileSync(syncStatusFile, 'utf-8'));
  }
  const now = new Date().toISOString();
  if (type === 'employees') data.last_sync_employees = now;
  if (type === 'attendance') data.last_sync_attendance = now;
  fs.writeFileSync(syncStatusFile, JSON.stringify(data, null, 2));
}

// New: Basic status info
function getBasicStatus() {
  return {
    status: 'ok',
    uptime_seconds: process.uptime(),
    timestamp: new Date().toISOString(),
    node_version: process.version,
    platform: process.platform
  };
}

// New: Detailed status info
function getDetailedStatus() {
  const lastSync = getLastSyncStatus();

  return {
    status: 'ok',
    uptime_seconds: process.uptime(),
    timestamp: new Date().toISOString(),
    node_version: process.version,
    platform: process.platform,
    memory: process.memoryUsage(),
    cpu_load: os.loadavg(),
    last_sync: lastSync
  };
}

module.exports = {
  getLastSyncStatus,
  updateLastSyncStatus,
  getBasicStatus,
  getDetailedStatus
};