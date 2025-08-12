
// migrations/20240615_init.js - Complete Database Schema
exports.up = function(knex) {
  return knex.schema
    // Device Credentials Table
    .createTable('device_credentials', function(table) {
      table.increments('id').primary();
      table.string('username', 100).unique().notNullable();
      table.string('password_hash', 255).notNullable();
      table.string('device_type', 50).defaultTo('ipad');
      table.string('device_model', 100);
      table.boolean('is_active').defaultTo(true);
      table.timestamp('last_login');
      table.timestamps(true, true);

      // Indexes
      table.index(['username']);
      table.index(['is_active']);
    })

    // Employees Table
    .createTable('employees', function(table) {
      table.increments('id').primary();
      table.string('employee_id', 50).unique().notNullable();
      table.string('first_name', 100).notNullable();
      table.string('last_name', 100).notNullable();
      table.string('middle_name', 100);
      table.string('email', 255).unique();
      table.string('phone', 20);
      table.string('national_id', 20).unique();
      table.string('department', 100);
      table.string('position', 100);
      table.string('company', 100);
      table.string('site_id', 50);
      table.date('date_of_birth');
      table.date('date_of_joining');
      table.enum('gender', ['Male', 'Female', 'Other']);
      table.enum('status', ['Active', 'Inactive', 'Left']).defaultTo('Active');
      table.boolean('is_active').defaultTo(true);
      table.timestamps(true, true);

      // Indexes
      table.index(['employee_id']);
      table.index(['email']);
      table.index(['national_id']);
      table.index(['is_active']);
      table.index(['department']);
      table.index(['status']);
    })

    // Biometrics Table
    .createTable('biometrics', function(table) {
      table.increments('id').primary();
      table.string('employee_id', 50).notNullable();
      table.string('template_hash', 255).notNullable();
      table.string('template_type', 50).defaultTo('face');
      table.integer('template_version').defaultTo(1);
      table.string('device_id', 100);
      table.timestamp('registered_at').defaultTo(knex.fn.now());
      table.boolean('is_active').defaultTo(true);
      table.timestamps(true, true);

      // Foreign key
      table.foreign('employee_id').references('employee_id').inTable('employees').onDelete('CASCADE');

      // Indexes
      table.index(['employee_id']);
      table.index(['template_hash']);
      table.index(['is_active']);
    })

    // Attendance Table
    .createTable('attendance', function(table) {
      table.increments('id').primary();
      table.string('employee_id', 50).notNullable();
      table.timestamp('timestamp').notNullable();
      table.enum('status', ['clock-in', 'clock-out']).notNullable();
      table.string('device_id', 100);
      table.string('site_id', 50);
      table.decimal('latitude', 10, 6);
      table.decimal('longitude', 10, 6);
      table.string('record_hash', 255).unique().notNullable();
      table.string('batch_id', 100);
      table.boolean('synced').defaultTo(false);
      table.timestamp('synced_at');
      table.text('sync_error');
      table.integer('retry_count').defaultTo(0);
      table.timestamps(true, true);

      // Foreign key
      table.foreign('employee_id').references('employee_id').inTable('employees').onDelete('CASCADE');

      // Indexes
      table.index(['employee_id']);
      table.index(['timestamp']);
      table.index(['status']);
      table.index(['record_hash']);
      table.index(['synced']);
      table.index(['batch_id']);
    })

    // Attendance Queue Table (for offline sync)
    .createTable('attendance_queue', function(table) {
      table.increments('id').primary();
      table.string('employee_id', 50).notNullable();
      table.timestamp('timestamp').notNullable();
      table.enum('status', ['clock-in', 'clock-out']).notNullable();
      table.string('device_id', 100);
      table.string('site_id', 50);
      table.decimal('latitude', 10, 6);
      table.decimal('longitude', 10, 6);
      table.string('record_hash', 255).unique().notNullable();
      table.string('batch_id', 100);
      table.integer('retry_count').defaultTo(0);
      table.boolean('synced').defaultTo(false);
      table.timestamp('synced_at');
      table.text('error_message');
      table.enum('priority', ['low', 'medium', 'high']).defaultTo('medium');
      table.timestamps(true, true);

      // Indexes
      table.index(['employee_id']);
      table.index(['synced']);
      table.index(['retry_count']);
      table.index(['priority']);
      table.index(['created_at']);
    })

    // Sync Status Table
    .createTable('sync_status', function(table) {
      table.increments('id').primary();
      table.string('sync_type', 50).notNullable(); // 'attendance', 'employees'
      table.timestamp('last_sync').defaultTo(knex.fn.now());
      table.integer('records_synced').defaultTo(0);
      table.integer('records_failed').defaultTo(0);
      table.text('last_error');
      table.boolean('is_running').defaultTo(false);
      table.timestamps(true, true);

      // Indexes
      table.index(['sync_type']);
      table.index(['last_sync']);
    })

    // System Metrics Table
    .createTable('system_metrics', function(table) {
      table.increments('id').primary();
      table.string('metric_name', 100).notNullable();
      table.string('metric_value', 255);
      table.text('metric_data'); // JSON data
      table.timestamp('recorded_at').defaultTo(knex.fn.now());
      table.timestamps(true, true);

      // Indexes
      table.index(['metric_name']);
      table.index(['recorded_at']);
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('system_metrics')
    .dropTableIfExists('sync_status')
    .dropTableIfExists('attendance_queue')
    .dropTableIfExists('attendance')
    .dropTableIfExists('biometrics')
    .dropTableIfExists('employees')
    .dropTableIfExists('device_credentials');
};
// This migration script creates the initial database schema for the KBAI system.
// It includes tables for device credentials, employees, biometrics, attendance records,