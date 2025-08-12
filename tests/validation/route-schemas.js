
// tests/validation/route-schemas.js - Route Validation Schemas
const Joi = require('joi');

// Employee registration schema
const employeeRegistrationSchema = Joi.object({
  first_name: Joi.string().alpha().required(),
  last_name: Joi.string().alpha().required(),
  middle_name: Joi.string().alpha().optional(),
  custom_national_id: Joi.string().pattern(/^\d{7,9}$/).required(),
  gender: Joi.string().valid('Male', 'Female', 'Other').optional(),
  cell_number: Joi.string().pattern(/^(\+254|0)?7\d{8}$/).required(),
  personal_email: Joi.string().email().optional(),
  date_of_birth: Joi.date().iso().required(),
  date_of_joining: Joi.date().iso().required(),
  company: Joi.string().required(),
  custom_site: Joi.string().optional(),
  status: Joi.string().valid('Active', 'Inactive', 'Left').required(),
  department: Joi.string().optional(),
  position: Joi.string().optional()
});

// Attendance record schema
const attendanceRecordSchema = Joi.object({
  employee_id: Joi.string().required(),
  timestamp: Joi.date().iso().required(),
  status: Joi.string().valid('clock-in', 'clock-out').required(),
  device_id: Joi.string().optional(),
  site_id: Joi.string().optional(),
  latitude: Joi.number().min(-90).max(90).optional(),
  longitude: Joi.number().min(-180).max(180).optional(),
  record_id: Joi.string().optional()
});

// Batch attendance schema
const batchAttendanceSchema = Joi.object({
  records: Joi.array().items(attendanceRecordSchema).min(1).max(200).required(),
  batch_id: Joi.string().optional(),
  offline_sync: Joi.boolean().optional()
});

// Biometric registration schema
const biometricRegistrationSchema = Joi.object({
  employee_id: Joi.string().required(),
  template_hash: Joi.string().hex().required(),
  registered_at: Joi.date().iso().optional(),
  template_type: Joi.string().valid('face', 'fingerprint').optional(),
  device_id: Joi.string().optional()
});

// Device login schema
const deviceLoginSchema = Joi.object({
  username: Joi.string().min(3).max(50).required(),
  password: Joi.string().min(6).required(),
  device_id: Joi.string().min(3).max(100).optional(),
  device_type: Joi.string().valid('ipad', 'android', 'face_terminal', 'web').optional()
});

// Sync configuration schema
const syncConfigSchema = Joi.object({
  sync_interval: Joi.number().min(5000).optional(),
  batch_size: Joi.number().min(1).max(100).optional(),
  max_retries: Joi.number().min(1).max(10).optional(),
  retry_delay: Joi.number().min(1000).optional()
});

module.exports = {
  employeeRegistrationSchema,
  attendanceRecordSchema,
  batchAttendanceSchema,
  biometricRegistrationSchema,
  deviceLoginSchema,
  syncConfigSchema
};
