# Kiron Biometric Attendance Integration API (KBAI API) v2.0

## Overview

The Kiron Biometric Attendance Integration API (KBAI API) is an enhanced face recognition attendance system designed for Kiron Construction Company. This version includes batch processing capabilities, idempotency features, and robust offline synchronization.

## Key Features

### ✅ Enhanced Features (v2.0)
- **Batch Upload Support**: Process multiple attendance records in a single request
- **Idempotency**: Prevent duplicate entries using unique record IDs or hashes
- **Offline Sync**: Queue records when ERPNext is unavailable and sync when connection is restored
- **Retry Logic**: Automatic retry mechanism for failed sync operations
- **Record Tracking**: Complete audit trail of all attendance records
- **Performance Optimization**: Rate limiting, connection pooling, and batch processing
- **Comprehensive Monitoring**: Detailed statistics and health checks

### ❌ Removed Features
- **Deprecated Employee ID Generation**: Removed KIRYYXXXX format generation logic
- **Legacy Sync Methods**: Replaced with enhanced batch processing

## API Endpoints

### Authentication
- `POST /api/v1/auth/login` - User authentication
- `POST /api/v1/auth/refresh` - Refresh JWT token

### Employee Management
- `GET /api/v1/employees` - List employees
- `POST /api/v1/employees` - Register single employee
- `GET /api/v1/employees/:id` - Get employee details
- `PUT /api/v1/employees/:id` - Update employee
- `DELETE /api/v1/employees/:id` - Delete employee

### Attendance (Enhanced)
- `POST /api/v1/attendance/clock` - Single attendance record
- `POST /api/v1/attendance/batch` - **NEW** Batch attendance upload (1-100 records)
- `GET /api/v1/attendance/status/:record_id` - **NEW** Check record status
- `GET /api/v1/attendance/pending` - **NEW** Get pending sync records

### Sync Operations (Enhanced)
- `POST /api/v1/sync/employees` - **ENHANCED** Batch employee sync (1-50 employees)
- `POST /api/v1/sync/attendance` - **ENHANCED** Batch attendance sync (1-100 records)
- `GET /api/v1/sync/status` - **NEW** Get sync service status
- `POST /api/v1/sync/trigger` - **NEW** Manually trigger sync
- `POST /api/v1/sync/retry-failed` - **NEW** Retry failed records
- `GET /api/v1/sync/pending` - **NEW** Get pending records with pagination
- `GET /api/v1/sync/batch/:batch_id` - **NEW** Get batch processing status
- `POST /api/v1/sync/cleanup` - **NEW** Cleanup old synced records
- `PUT /api/v1/sync/config` - **NEW** Update sync configuration

### System Status
- `GET /api/v1/status` - System health check
- `GET /api/v1/status/detailed` - Detailed system status
- `GET /health` - Basic health check

## Request/Response Examples

### Single Attendance Record
```http
POST /api/v1/attendance/clock
Content-Type: application/json
Authorization: Bearer <jwt_token>

{
  "employee_id": "EMP001",
  "timestamp": "2024-06-10T08:30:00.000Z",
  "status": "clock-in",
  "device_id": "KBAI-Device-001",
  "site_id": "SITE001",
  "latitude": -1.2921,
  "longitude": 36.8219,
  "record_id": "optional-unique-id"
}
```

### Batch Attendance Upload
```http
POST /api/v1/attendance/batch
Content-Type: application/json
Authorization: Bearer <jwt_token>

{
  "records": [
    {
      "employee_id": "EMP001",
      "timestamp": "2024-06-10T08:30:00.000Z",
      "status": "clock-in",
      "device_id": "KBAI-Device-001",
      "site_id": "SITE001"
    },
    {
      "employee_id": "EMP002",
      "timestamp": "2024-06-10T08:35:00.000Z",
      "status": "clock-in",
      "device_id": "KBAI-Device-001",
      "site_id": "SITE001"
    }
  ],
  "batch_id": "batch-2024-06-10-001",
  "offline_sync": false
}
```

### Batch Response
```json
{
  "status": "success",
  "message": "Batch processing completed",
  "data": {
    "batch_id": "batch-2024-06-10-001",
    "total_records": 2,
    "summary": {
      "synced": 1,
      "queued": 1,
      "duplicates": 0,
      "errors": 0
    },
    "results": [
      {
        "record_id": "hash-abc123",
        "status": "synced",
        "message": "Successfully synced to ERPNext"
      },
      {
        "record_id": "hash-def456",
        "status": "queued",
        "queue_id": 123,
        "message": "Queued due to sync failure"
      }
    ]
  }
}
```

## Idempotency

The API ensures idempotency through:

1. **Record Hashes**: Automatically generated SHA-256 hashes based on:
   - Employee ID
   - Timestamp
   - Status (clock-in/clock-out)
   - Device ID

2. **Custom Record IDs**: Clients can provide their own unique `record_id`

3. **Duplicate Detection**: All records are checked against existing hashes before processing

## Offline Sync

### How it Works
1. **Primary Sync**: Attempts direct sync to ERPNext
2. **Queue on Failure**: Failed records are queued locally
3. **Background Sync**: Automatic retry every 5 minutes (configurable)
4. **Manual Triggers**: Force sync via API endpoints

### Queue Management
- **Retry Logic**: Exponential backoff with max 3 retries
- **Error Tracking**: Detailed error messages and retry counts
- **Batch Processing**: Processes up to 20 records per sync cycle
- **Cleanup**: Automatic cleanup of old synced records

## Configuration

### Environment Variables
```bash
# ERPNext Configuration
ERP_BASE_URL=https://your-erpnext-instance.com
ERP_API_KEY=your_api_key
ERP_API_SECRET=your_api_secret
ERP_BATCH_SIZE=10
ERP_RETRY_COUNT=3

# Sync Configuration
SYNC_INTERVAL=300000  # 5 minutes
SYNC_BATCH_SIZE=20
SYNC_MAX_RETRIES=3

# Rate Limiting
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_WINDOW_MS=60000
```

### Runtime Configuration
```http
PUT /api/v1/sync/config
{
  "sync_interval": 300000,
  "batch_size": 25,
  "max_retries": 5
}
```

## Error Handling

### Error Response Format
```json
{
  "status": "error",
  "error_code": "VALIDATION_ERROR",
  "message": "Validation failed",
  "details": [
    {
      "field": "employee_id",
      "message": "Employee ID is required"
    }
  ],
  "timestamp": "2024-06-10T10:30:00.000Z",
  "request_id": "req-123456"
}
```

### Common Error Codes
- `VALIDATION_ERROR`: Request validation failed
- `DUPLICATE_RECORD`: Record already exists
- `ERP_CONNECTION_ERROR`: ERPNext connection failed
- `BATCH_SIZE_EXCEEDED`: Too many records in batch
- `RATE_LIMIT_EXCEEDED`: Too many requests
- `AUTHENTICATION_FAILED`: Invalid credentials
- `RECORD_NOT_FOUND`: Record doesn't exist

## Monitoring & Statistics

### Sync Statistics
```http
GET /api/v1/sync/status
```

```json
{
  "status": "success",
  "data": {
    "service": {
      "is_running": true,
      "sync_interval": 300000,
      "batch_size": 20,
      "next_sync": "2024-06-10T10:35:00.000Z"
    },
    "statistics": {
      "total_records": 1500,
      "synced_records": 1450,
      "pending_records": 45,
      "failed_records": 5
    },
    "erp_connection": {
      "status": "connected",
      "response_time": 250
    }
  }
}
```

## Migration Guide

### From v1.0 to v2.0

1. **Update Dependencies**:
   ```bash
   npm install
   ```

2. **Database Migration**:
   ```bash
   npm run db:migrate
   ```

3. **Update Environment Variables**:
   - Add new sync configuration variables
   - Update ERPNext connection settings

4. **Code Changes**:
   - Replace single attendance calls with batch where appropriate
   - Remove any employee ID generation logic
   - Update error handling for new error codes

5. **Test Migration**:
   ```bash
   npm test
   ```

## Performance Considerations

### Batch Sizes
- **Attendance**: Max 100 records per batch
- **Employees**: Max 50 employees per batch
- **Sync Operations**: Configurable batch size (default: 20)

### Rate Limits
- **General API**: 100 requests/minute
- **Authentication**: 10 attempts/15 minutes
- **Batch Operations**: 50 requests/minute

### Database Optimization
- Indexed fields for faster queries
- Automatic cleanup of old records
- Connection pooling for better performance

## Security

### Authentication
- JWT tokens with configurable expiration
- API key authentication for service-to-service calls
- Rate limiting to prevent abuse

### Data Protection
- Request validation and sanitization
- SQL injection prevention
- CORS configuration
- Security headers (Helmet.js)

## Support

For technical support and documentation:
- **API Documentation**: `/api/docs`
- **Health Check**: `/health`
- **System Status**: `/api/v1/status`

## Changelog

### v2.0.0 (Current)
- ✅ Added batch upload support for attendance
- ✅ Implemented idempotency with record hashing
- ✅ Enhanced offline sync capabilities
- ✅ Added comprehensive monitoring and statistics
- ✅ Improved error handling and retry logic
- ❌ Removed deprecated employee ID generation
- ✅ Performance optimizations and rate limiting

### v1.0.0
- Basic attendance recording
- Employee management
- Simple ERPNext integration
- Basic sync functionality
