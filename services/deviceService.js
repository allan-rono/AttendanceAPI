const bcrypt = require('bcryptjs');
const db = require('../utils/pg');
const logger = require('../utils/logger');

class DeviceService {
  /**
   * Authenticate device credentials
   * @param {string} username 
   * @param {string} password 
   * @returns {Promise<Object|null>}
   */
  async authenticateDevice(username, password) {
    try {
      const device = await db('device_credentials')
        .where({ username, is_active: true })
        .first();
      
      if (!device) {
        logger.warn(`Authentication failed: device not found - ${username}`);
        return null;
      }
      
      const isValidPassword = await bcrypt.compare(password, device.password_hash);
      
      if (!isValidPassword) {
        logger.warn(`Authentication failed: invalid password - ${username}`);
        return null;
      }
      
      // Update last login
      await this.updateLastLogin(device.id);
      
      logger.info(`Device authenticated successfully: ${username} (${device.device_type})`);
      
      return {
        id: device.id,
        username: device.username,
        device_type: device.device_type,
        device_model: device.device_model,
        description: device.description
      };
      
    } catch (error) {
      logger.error('Device authentication error:', error);
      throw error;
    }
  }
  
  /**
   * Update last login timestamp
   * @param {number} deviceId 
   */
  async updateLastLogin(deviceId) {
    try {
      await db('device_credentials')
        .where({ id: deviceId })
        .update({ last_login: db.fn.now() });
    } catch (error) {
      logger.error('Failed to update last login:', error);
      // Don't throw - this is not critical
    }
  }
  
  /**
   * Create new device credentials
   * @param {Object} deviceData 
   * @returns {Promise<Object>}
   */
  async createDevice(deviceData) {
    const { username, password, device_type, device_model } = deviceData;
    
    try {
      const saltRounds = 12;
      const password_hash = await bcrypt.hash(password, saltRounds);
      
      const [device] = await db('device_credentials')
        .insert({
          username,
          password_hash,
          device_type,
          device_model,
          is_active: true
        })
        .returning(['id', 'username', 'device_type', 'device_model', 'created_at']);
      
      logger.info(`New device created: ${username} (${device_type})`);
      return device;
      
    } catch (error) {
      if (error.code === '23505') { // Unique constraint violation
        throw new Error('Device username already exists');
      }
      logger.error('Device creation error:', error);
      throw error;
    }
  }
  
  /**
   * Deactivate device
   * @param {string} username 
   */
  async deactivateDevice(username) {
    try {
      const updated = await db('device_credentials')
        .where({ username })
        .update({ is_active: false });
      
      if (updated === 0) {
        throw new Error('Device not found');
      }
      
      logger.info(`Device deactivated: ${username}`);
      return true;
      
    } catch (error) {
      logger.error('Device deactivation error:', error);
      throw error;
    }
  }
  
  /**
   * List all devices
   * @returns {Promise<Array>}
   */
  async listDevices() {
    try {
      return await db('device_credentials')
        .select(['id', 'username', 'device_type', 'device_model', 'is_active', 'last_login', 'created_at'])
        .orderBy('created_at', 'desc');
    } catch (error) {
      logger.error('List devices error:', error);
      throw error;
    }
  }
}

module.exports = new DeviceService();