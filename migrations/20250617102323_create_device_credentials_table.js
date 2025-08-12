exports.up = function(knex) {
  return knex.schema.hasTable('device_credentials').then(function(exists) {
    if (!exists) {
      return knex.schema.createTable('device_credentials', function(table) {
        table.increments('id').primary();
        table.string('username', 255).notNullable();
        table.string('password_hash', 255).notNullable();
        table.string('device_type', 255).defaultTo('ipad');
        table.string('device_model', 255);
        table.boolean('is_active').defaultTo(true);
        table.timestamp('last_login');
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').defaultTo(knex.fn.now());
      });
    }
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('device_credentials');
};