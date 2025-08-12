#!/usr/bin/env node

require('dotenv').config();
const deviceService = require('../services/deviceService');

const command = process.argv[2];
const args = process.argv.slice(3);

async function main() {
  try {
    switch (command) {
      case 'list':
        const devices = await deviceService.listDevices();
        console.table(devices);
        break;
        
      case 'create':
        if (args.length < 4) {
          console.error('Usage: create <username> <password> <device_type> <description>');
          process.exit(1);
        }
        const [username, password, device_type, description] = args;
        const device = await deviceService.createDevice({
          username, password, device_type, description
        });
        console.log('Device created:', device);
        break;
        
      case 'deactivate':
        if (args.length < 1) {
          console.error('Usage: deactivate <username>');
          process.exit(1);
        }
        await deviceService.deactivateDevice(args[0]);
        console.log('Device deactivated');
        break;
        
      default:
        console.log('Available commands: list, create, deactivate');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

main();