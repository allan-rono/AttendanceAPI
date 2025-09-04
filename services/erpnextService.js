const axios = require('axios');
const Bottleneck = require('bottleneck');
const logger = require('../utils/logger');

// Configure axios defaults to prevent 417 errors
axios.defaults.headers.common['Expect'] = '';
// Disable automatic Expect header for large requests
axios.defaults.maxContentLength = Infinity;
axios.defaults.maxBodyLength = Infinity;

const ERP_BASE = process.env.ERP_BASE_URL;
const headers = {
  Authorization: `token ${process.env.ERP_API_KEY}:${process.env.ERP_API_SECRET}`,
  'Content-Type': 'application/json',
  'Accept': 'application/json'
};

// Enhanced bottleneck for rate limiting and retries
const limiter = new Bottleneck({
  maxConcurrent: parseInt(process.env.ERP_MAX_CONCURRENT) || 3,
  minTime: parseInt(process.env.ERP_MIN_TIME) || 300,
  reservoir: parseInt(process.env.ERP_RESERVOIR) || 100,
  reservoirRefreshAmount: parseInt(process.env.ERP_RESERVOIR_REFRESH) || 100,
  reservoirRefreshInterval: parseInt(process.env.ERP_RESERVOIR_INTERVAL) || 60000
});

// Retry configuration
const retryConfig = {
  retries: parseInt(process.env.ERP_RETRY_COUNT) || 3,
  retryDelay: parseInt(process.env.ERP_RETRY_DELAY) || 1000,
  retryCondition: (error) => {
    // Retry on network errors, 5xx server errors, or 417 Expectation Failed
    return !error.response || 
           error.response.status >= 500 || 
           error.response.status === 417;
  }
};

async function safePost(url, payload, options = {}) {
  const maxRetries = options.retries || retryConfig.retries;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const axiosConfig = {
        headers: {
          ...headers,
          // Explicitly prevent Expect header to avoid 417 errors
          'Expect': ''
        },
        timeout: parseInt(process.env.ERP_TIMEOUT) || 30000,
        // Disable automatic request body compression that can trigger Expect header
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        // Ensure no Expect header is sent
        transformRequest: [function (data, headers) {
          delete headers['Expect'];
          return data;
        }],
        ...options 
      };

      const response = await limiter.schedule(() => axios.post(url, payload, axiosConfig));

      return { 
        success: true, 
        data: response.data.data || response.data.message,
        status: response.status
      };
    } catch (err) {
      lastError = err;

      // Log attempt
      logger.warn(`ERPNext POST attempt ${attempt}/${maxRetries} failed: ${url} - ${err.message}`);
      
      // Log more details for 417 errors
      if (err.response?.status === 417) {
        logger.error('HTTP 417 Expectation Failed - Request headers:', err.config?.headers);
        logger.error('HTTP 417 Expectation Failed - URL:', url);
        logger.error('HTTP 417 Expectation Failed - Payload:', payload);
      }

      // Check if we should retry
      if (attempt < maxRetries && retryConfig.retryCondition(err)) {
        const delay = retryConfig.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      break;
    }
  }

  // All retries failed
  logger.error(`ERPNext POST failed after ${maxRetries} attempts: ${url} - ${lastError.message}`);
  if (lastError.response?.data) {
    logger.error('ERPNext error response:', lastError.response.data);
  }

  return { 
    success: false, 
    error: lastError.response?.data?.message || lastError.message,
    status: lastError.response?.status,
    retries: maxRetries
  };
}

async function safeGet(url, params = {}, options = {}) {
  const maxRetries = options.retries || retryConfig.retries;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const axiosConfig = {
        headers: {
          ...headers,
          // Explicitly prevent Expect header to avoid 417 errors
          'Expect': ''
        },
        params, 
        timeout: parseInt(process.env.ERP_TIMEOUT) || 30000,
        // Disable automatic request body compression that can trigger Expect header
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        // Ensure no Expect header is sent
        transformRequest: [function (data, headers) {
          delete headers['Expect'];
          return data;
        }],
        ...options 
      };

      const response = await limiter.schedule(() => axios.get(url, axiosConfig));

      return { 
        success: true, 
        data: response.data.data,
        total: response.data.total || (Array.isArray(response.data.data) ? response.data.data.length : 0),
        status: response.status
      };
    } catch (err) {
      lastError = err;

      logger.warn(`ERPNext GET attempt ${attempt}/${maxRetries} failed: ${url} - ${err.message}`);
      
      // Log more details for 417 errors
      if (err.response?.status === 417) {
        logger.error('HTTP 417 Expectation Failed - Request headers:', err.config?.headers);
        logger.error('HTTP 417 Expectation Failed - URL:', url);
        logger.error('HTTP 417 Expectation Failed - Params:', params);
      }

      if (attempt < maxRetries && retryConfig.retryCondition(err)) {
        const delay = retryConfig.retryDelay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      break;
    }
  }

  logger.error(`ERPNext GET failed after ${maxRetries} attempts: ${url} - ${lastError.message}`);
  if (lastError.response?.data) {
    logger.error('ERPNext error response:', lastError.response.data);
  }
  
  return { 
    success: false, 
    error: lastError.response?.data?.message || lastError.message,
    status: lastError.response?.status,
    retries: maxRetries
  };
}

// Check if National ID exists
async function checkNationalID(national_id) {
  const url = `${ERP_BASE}/api/resource/Employee`;
  const params = {
    filters: JSON.stringify([["custom_national_id", "=", national_id]]),
    fields: JSON.stringify(["name", "employee_name", "custom_national_id"])
  };

  const result = await safeGet(url, params);
  return {
    exists: result.success && Array.isArray(result.data) && result.data.length > 0,
    employee: result.success && result.data.length > 0 ? result.data[0] : null,
    error: result.success ? null : result.error
  };
}

// Register employee
async function registerEmployee(emp) {
  const url = `${ERP_BASE}/api/resource/Employee`;

  // Validate required fields
  if (!emp.first_name || !emp.custom_national_id) {
    return {
      success: false,
      error: 'Missing required fields: first_name and custom_national_id are mandatory'
    };
  }

  const payload = {
    first_name: emp.first_name,
    last_name: emp.last_name,
    middle_name: emp.middle_name,
    custom_national_id: parseInt(emp.custom_national_id, 10),
    gender: emp.gender,
    cell_number: emp.cell_number || emp.phone || emp.mobile_number,
    personal_email: emp.email,
    date_of_birth: emp.date_of_birth,
    date_of_joining: emp.date_of_joining,
    company: emp.company || process.env.DEFAULT_COMPANY,
    status: emp.status || 'Active',
    department: emp.department,
    designation: emp.designation,
    custom_site: emp.site_id
  };

  // Remove undefined/null values
  Object.keys(payload).forEach(key => {
    if (payload[key] === undefined || payload[key] === null || payload[key] === '') {
      delete payload[key];
    }
  });

  return await safePost(url, payload);
}

// Submit single attendance check-in/out
async function submitCheckin(record) {
  const url = `${ERP_BASE}/api/resource/Employee Checkin`;

  // Validate required fields
  const status = record.status || record.log_type;
  if (!record.employee_id || !record.timestamp || !status) {
    return {
      success: false,
      error: 'Missing required fields: employee_id, timestamp, and status are mandatory'
    };
  }

  // Format datetime for ERPNext (remove timezone info)
  const formattedTime = new Date(record.timestamp).toISOString().slice(0, 19).replace('T', ' ');

  const payload = {
    employee: record.employee_id,
    time: formattedTime, // Use formatted time without timezone
    log_type: status === 'clock-in' ? 'IN' : (status === 'IN' ? 'IN' : 'OUT'),
    device_id: record.device_id || process.env.DEFAULT_DEVICE_ID || "KBAI-Device-001"
  };

  // Add optional fields if present
  if (record.site_id) payload.custom_site = record.site_id;
  if (record.latitude && record.longitude) {
    payload.custom_latitude = record.latitude;
    payload.custom_longitude = record.longitude;
  }

  logger.debug('Submitting checkin payload:', payload);

  const result = await safePost(url, payload);

  if (!result.success) {
    logger.error('ERPNext error response:', result.error, result.data);
  }

  return result;
}

// Batch submit attendance records
async function submitBatchCheckin(records, options = {}) {
  const batchSize = options.batchSize || parseInt(process.env.ERP_BATCH_SIZE) || 10;
  const results = [];
  const errors = [];

  logger.info(`Starting batch checkin: ${records.length} records, batch size: ${batchSize}`);

  // Process records in batches to avoid overwhelming ERPNext
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const batchResults = [];

    // Process batch concurrently but with rate limiting
    const batchPromises = batch.map(async (record, index) => {
      try {
        const result = await submitCheckin(record);
        return {
          index: i + index,
          record_id: record.record_id || record.record_hash,
          employee_id: record.employee_id,
          success: result.success,
          data: result.data,
          error: result.error
        };
      } catch (error) {
        logger.error(`Batch checkin error for record ${i + index}:`, error.message);
        return {
          index: i + index,
          record_id: record.record_id || record.record_hash,
          employee_id: record.employee_id,
          success: false,
          error: error.message
        };
      }
    });

    const batchResults_resolved = await Promise.allSettled(batchPromises);

    batchResults_resolved.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
        if (!result.value.success) {
          errors.push(result.value);
        }
      } else {
        const errorResult = {
          index: i + index,
          record_id: batch[index].record_id || batch[index].record_hash,
          employee_id: batch[index].employee_id,
          success: false,
          error: result.reason.message || 'Unknown error'
        };
        results.push(errorResult);
        errors.push(errorResult);
      }
    });

    // Add delay between batches to prevent overwhelming the server
    if (i + batchSize < records.length) {
      const batchDelay = parseInt(process.env.ERP_BATCH_DELAY) || 1000;
      await new Promise(resolve => setTimeout(resolve, batchDelay));
    }

    logger.info(`Batch ${Math.floor(i / batchSize) + 1} completed: ${batch.length} records processed`);
  }

  const successCount = results.filter(r => r.success).length;
  const errorCount = errors.length;

  logger.info(`Batch checkin completed: ${successCount} successful, ${errorCount} failed`);

  return {
    success: errorCount === 0,
    total: records.length,
    successful: successCount,
    failed: errorCount,
    results,
    errors: errorCount > 0 ? errors : undefined
  };
}

// Batch register employees
async function registerBatchEmployees(employees, options = {}) {
  const batchSize = options.batchSize || parseInt(process.env.ERP_BATCH_SIZE) || 5;
  const results = [];
  const errors = [];

  logger.info(`Starting batch employee registration: ${employees.length} employees, batch size: ${batchSize}`);

  for (let i = 0; i < employees.length; i += batchSize) {
    const batch = employees.slice(i, i + batchSize);

    const batchPromises = batch.map(async (employee, index) => {
      try {
        const result = await registerEmployee(employee);
        return {
          index: i + index,
          national_id: employee.custom_national_id,
          success: result.success,
          data: result.data,
          error: result.error
        };
      } catch (error) {
        logger.error(`Batch employee registration error for index ${i + index}:`, error.message);
        return {
          index: i + index,
          national_id: employee.custom_national_id,
          success: false,
          error: error.message
        };
      }
    });

    const batchResults = await Promise.allSettled(batchPromises);

    batchResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
        if (!result.value.success) {
          errors.push(result.value);
        }
      } else {
        const errorResult = {
          index: i + index,
          national_id: batch[index].custom_national_id,
          success: false,
          error: result.reason.message || 'Unknown error'
        };
        results.push(errorResult);
        errors.push(errorResult);
      }
    });

    // Delay between batches
    if (i + batchSize < employees.length) {
      const batchDelay = parseInt(process.env.ERP_BATCH_DELAY) || 2000;
      await new Promise(resolve => setTimeout(resolve, batchDelay));
    }

    logger.info(`Employee batch ${Math.floor(i / batchSize) + 1} completed: ${batch.length} employees processed`);
  }

  const successCount = results.filter(r => r.success).length;
  const errorCount = errors.length;

  logger.info(`Batch employee registration completed: ${successCount} successful, ${errorCount} failed`);

  return {
    success: errorCount === 0,
    total: employees.length,
    successful: successCount,
    failed: errorCount,
    results,
    errors: errorCount > 0 ? errors : undefined
  };
}

// Health check for ERPNext connection
async function healthCheck() {
  try {
    const url = `${ERP_BASE}/api/method/ping`;
    const result = await safeGet(url, {}, { retries: 1 });

    return {
      success: result.success,
      status: result.success ? 'connected' : 'disconnected',
      response_time: Date.now(),
      error: result.error
    };
  } catch (error) {
    return {
      success: false,
      status: 'disconnected',
      error: error.message
    };
  }
}

// Get ERPNext system info
async function getSystemInfo() {
  try {
    const url = `${ERP_BASE}/api/method/frappe.utils.get_site_info`;
    const result = await safeGet(url, {}, { retries: 1 });

    return result;
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// Get all sites with optional filtering
async function getSites(options = {}) {
  const { limit = 100, offset = 0, search, status } = options;
  
  try {
    const url = `${ERP_BASE}/api/resource/Site`;
    
    // Build filters array
    const filters = [];
    
    if (status) {
      filters.push(["status", "=", status]);
    }
    
    if (search) {
      // Search in site name and description
      filters.push([
        "or",
        ["site_name", "like", `%${search}%`]
      ]);
    }

    const params = {
      fields: JSON.stringify([
        "name",
        "site_name", 
        "status"
      ]),
      limit_start: offset,
      limit_page_length: limit,
      order_by: "site_name asc"
    };

    // Add filters if any exist
    if (filters.length > 0) {
      params.filters = JSON.stringify(filters);
    }

    logger.debug('Fetching sites with params:', params);

    const result = await safeGet(url, params);
    
    if (result.success) {
      // Transform the data to match expected format
      const transformedData = result.data.map(site => ({
        id: site.name,
        site_name: site.site_name,
        status: site.status
      }));

      return {
        success: true,
        data: transformedData,
        total: result.total
      };
    }

    return result;

  } catch (error) {
    logger.error('Error in getSites:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// Get a specific site by ID
async function getSiteById(siteId) {
  try {
    const url = `${ERP_BASE}/api/resource/Site/${siteId}`;
    
    const params = {
      fields: JSON.stringify([
        "name",
        "site_name", 
        "status"
      ])
    };

    logger.debug(`Fetching site by ID: ${siteId}`);

    const result = await safeGet(url, params);
    
    if (result.success) {
      // Transform the data to match expected format
      const site = result.data;
      const transformedData = {
        id: site.name,
        site_name: site.site_name,
        status: site.status
      };

      return {
        success: true,
        data: transformedData
      };
    }

    return result;

  } catch (error) {
    logger.error('Error in getSiteById:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  checkNationalID,
  registerEmployee,
  submitCheckin,
  submitBatchCheckin,
  registerBatchEmployees,
  healthCheck,
  getSystemInfo,
  getSites,
  getSiteById
};
