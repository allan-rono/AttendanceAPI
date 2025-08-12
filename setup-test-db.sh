#!/bin/bash

echo "Running migrations..."
npx knex migrate:latest --env test

echo "Running seed data..."
npx knex seed:run --env test

echo "Database setup complete."