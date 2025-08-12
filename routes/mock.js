const express = require('express');
const router = express.Router();

if (process.env.ENABLE_MOCK_API === 'true') {
router.get('/timespring/employees', (req, res) => {
  res.json({
    employees: [
      {
        first_name: "Jane",
        last_name: "Doe",
        gender: "Female",
        custom_national_id: "98765432",
        cell_number: "+254701234567",
        personal_email: "janedoe@example.com",
        date_of_birth: "1995-04-15",
        date_of_joining: "2025-01-10",
        company: "Kiron Construction Company",
        status: "Active"
      }
    ]
  });
});
}
if (process.env.ENABLE_MOCK_API === 'true') {
router.get('/timespring/attendance', (req, res) => {
  res.json({
    attendance_records: [
      {
        employee_id: "KIR250001",
        timestamp: "2025-05-28T08:00:00",
        status: "clock-in",
        device_id: "FaceDevice-001",
        latitude: -1.2921,
        longitude: 36.8219
      },
      {
        employee_id: "KIR250001",
        timestamp: "2025-05-28T17:00:00",
        status: "clock-out",
        device_id: "FaceDevice-001",
        latitude: -1.2921,
        longitude: 36.8219
      }
    ]
  });
});
}

module.exports = router;
