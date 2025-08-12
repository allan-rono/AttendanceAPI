#!/usr/bin/env node
const { Client } = require('pg');

async function setupTestDatabase() {
  const client = new Client({
    host: process.env.TEST_DB_HOST || 'localhost',
    port: process.env.TEST_DB_PORT || 5432,
    user: process.env.TEST_DB_USER || 'postgres',
    password: process.env.TEST_DB_PASSWORD || 'Kiron2002.',
    database: 'postgres' // Connect to default database first
  });

  try {
    await client.connect();
    
    const testDbName = process.env.TEST_DB_NAME || 'kbai_db_test';
    
    // Drop test database if exists
    await client.query(`DROP DATABASE IF EXISTS "${testDbName}"`);
    
    // Create test database
    await client.query(`CREATE DATABASE "${testDbName}"`);
    
    console.log(`✅ Test database "${testDbName}" created successfully`);
  } catch (error) {
    console.error('❌ Error setting up test database:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  setupTestDatabase();
}

module.exports = setupTestDatabase;