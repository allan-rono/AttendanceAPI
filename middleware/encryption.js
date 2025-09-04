
/**
 * Field-Level Encryption Middleware for AttendanceAPI
 * Implements AES-256-GCM encryption for sensitive data fields
 * 
 * Security Features:
 * - Column-level encryption for biometric templates and personal data
 * - Key derivation using PBKDF2 with salt
 * - Authenticated encryption with GCM mode
 * - Secure key management with environment variables
 */

const crypto = require('crypto');
const { promisify } = require('util');

class FieldEncryption {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.keyLength = 32; // 256 bits
    this.ivLength = 16;  // 128 bits
    this.tagLength = 16; // 128 bits
    this.saltLength = 32; // 256 bits
    this.iterations = 100000; // PBKDF2 iterations
    
    // Master encryption key from environment
    this.masterKey = process.env.ENCRYPTION_MASTER_KEY;
    if (!this.masterKey || this.masterKey.length < 32) {
      throw new Error('ENCRYPTION_MASTER_KEY must be at least 32 characters');
    }
  }

  /**
   * Derive encryption key from master key and salt
   */
  deriveKey(salt) {
    return crypto.pbkdf2Sync(this.masterKey, salt, this.iterations, this.keyLength, 'sha256');
  }

  /**
   * Encrypt sensitive field data
   * @param {string} plaintext - Data to encrypt
   * @param {string} context - Context for key derivation (e.g., 'biometric', 'personal')
   * @returns {string} - Base64 encoded encrypted data with metadata
   */
  encrypt(plaintext, context = 'default') {
    if (!plaintext) return null;
    
    try {
      // Generate random salt and IV
      const salt = crypto.randomBytes(this.saltLength);
      const iv = crypto.randomBytes(this.ivLength);
      
      // Derive key with context
      const contextSalt = Buffer.concat([salt, Buffer.from(context, 'utf8')]);
      const key = this.deriveKey(contextSalt);
      
      // Create cipher
      const cipher = crypto.createCipher(this.algorithm, key);
      cipher.setAAD(Buffer.from(context, 'utf8')); // Additional authenticated data
      
      // Encrypt data
      let encrypted = cipher.update(plaintext, 'utf8');
      encrypted = Buffer.concat([encrypted, cipher.final()]);
      
      // Get authentication tag
      const tag = cipher.getAuthTag();
      
      // Combine all components: salt + iv + tag + encrypted
      const combined = Buffer.concat([salt, iv, tag, encrypted]);
      
      return combined.toString('base64');
    } catch (error) {
      throw new Error(`Encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt sensitive field data
   * @param {string} encryptedData - Base64 encoded encrypted data
   * @param {string} context - Context used during encryption
   * @returns {string} - Decrypted plaintext
   */
  decrypt(encryptedData, context = 'default') {
    if (!encryptedData) return null;
    
    try {
      // Decode from base64
      const combined = Buffer.from(encryptedData, 'base64');
      
      // Extract components
      const salt = combined.slice(0, this.saltLength);
      const iv = combined.slice(this.saltLength, this.saltLength + this.ivLength);
      const tag = combined.slice(this.saltLength + this.ivLength, this.saltLength + this.ivLength + this.tagLength);
      const encrypted = combined.slice(this.saltLength + this.ivLength + this.tagLength);
      
      // Derive key with context
      const contextSalt = Buffer.concat([salt, Buffer.from(context, 'utf8')]);
      const key = this.deriveKey(contextSalt);
      
      // Create decipher
      const decipher = crypto.createDecipher(this.algorithm, key);
      decipher.setAuthTag(tag);
      decipher.setAAD(Buffer.from(context, 'utf8'));
      
      // Decrypt data
      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      
      return decrypted.toString('utf8');
    } catch (error) {
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  /**
   * Encrypt biometric template data
   */
  encryptBiometric(templateHash) {
    return this.encrypt(templateHash, 'biometric_template');
  }

  /**
   * Decrypt biometric template data
   */
  decryptBiometric(encryptedTemplate) {
    return this.decrypt(encryptedTemplate, 'biometric_template');
  }

  /**
   * Encrypt personal data (National ID, DOB, etc.)
   */
  encryptPersonalData(data) {
    return this.encrypt(data, 'personal_data');
  }

  /**
   * Decrypt personal data
   */
  decryptPersonalData(encryptedData) {
    return this.decrypt(encryptedData, 'personal_data');
  }

  /**
   * Middleware for automatic encryption/decryption
   */
  middleware() {
    return {
      // Encrypt sensitive fields before saving to database
      encryptFields: (req, res, next) => {
        try {
          // Define fields that need encryption
          const sensitiveFields = {
            'national_id': 'personal_data',
            'date_of_birth': 'personal_data',
            'phone': 'personal_data',
            'email': 'personal_data',
            'template_hash': 'biometric_template'
          };

          // Encrypt fields in request body
          for (const [field, context] of Object.entries(sensitiveFields)) {
            if (req.body[field]) {
              req.body[`${field}_encrypted`] = this.encrypt(req.body[field], context);
              // Keep original for validation, remove before database save
              req.body[`${field}_original`] = req.body[field];
              delete req.body[field];
            }
          }

          next();
        } catch (error) {
          res.status(500).json({ 
            error: 'Encryption failed', 
            message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
          });
        }
      },

      // Decrypt sensitive fields after retrieving from database
      decryptFields: (data) => {
        try {
          const sensitiveFields = {
            'national_id_encrypted': { field: 'national_id', context: 'personal_data' },
            'date_of_birth_encrypted': { field: 'date_of_birth', context: 'personal_data' },
            'phone_encrypted': { field: 'phone', context: 'personal_data' },
            'email_encrypted': { field: 'email', context: 'personal_data' },
            'template_encrypted': { field: 'template_hash', context: 'biometric_template' }
          };

          // Handle both single objects and arrays
          const processItem = (item) => {
            for (const [encryptedField, config] of Object.entries(sensitiveFields)) {
              if (item[encryptedField]) {
                item[config.field] = this.decrypt(item[encryptedField], config.context);
                delete item[encryptedField]; // Remove encrypted version from response
              }
            }
            return item;
          };

          if (Array.isArray(data)) {
            return data.map(processItem);
          } else if (data && typeof data === 'object') {
            return processItem(data);
          }

          return data;
        } catch (error) {
          throw new Error(`Decryption failed: ${error.message}`);
        }
      }
    };
  }
}

// Export singleton instance
const fieldEncryption = new FieldEncryption();

module.exports = {
  FieldEncryption,
  fieldEncryption,
  encryptionMiddleware: fieldEncryption.middleware()
};
