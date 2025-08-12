// Generates Employee ID in KIRYYXXXX format
function generateEmployeeId(date_of_joining, national_id) {
  const year = new Date(date_of_joining).getFullYear().toString().slice(-2);
  // Use last 4 digits of National ID for uniqueness (or a DB sequence in production)
  const unique = national_id.slice(-4).padStart(4, '0');
  return `KIR${year}${unique}`;
}

module.exports = { generateEmployeeId };