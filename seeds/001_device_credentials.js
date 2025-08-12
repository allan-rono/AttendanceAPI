exports.seed = async function(knex) {
  // Deletes ALL existing entries
  await knex('device_credentials').del();

  // Inserts seed entries
  await knex('device_credentials').insert([
    {
      username: 'device_user_1',
      password_hash: 'hashed_password_1',
      device_type: 'ipad',
      device_model: 'iPad Pro',
      is_active: true,
      last_login: knex.fn.now(),
      created_at: knex.fn.now(),
      updated_at: knex.fn.now()
    },
    {
      username: 'device_user_2',
      password_hash: 'hashed_password_2',
      device_type: 'android',
      device_model: 'Samsung Galaxy Tab',
      is_active: true,
      last_login: knex.fn.now(),
      created_at: knex.fn.now(),
      updated_at: knex.fn.now()
    }
    // Add more seed data as needed
  ]);
};