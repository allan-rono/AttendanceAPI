
-- AttendanceAPI Database Encryption Migration
-- Implements column-level encryption for sensitive data
-- 
-- Security Features:
-- - Column-level encryption using pgcrypto
-- - Encrypted storage for biometric templates and personal data
-- - Secure key management with environment variables
-- - Backward compatibility during migration

-- Enable pgcrypto extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create encryption key management table
CREATE TABLE IF NOT EXISTS encryption_keys (
    id SERIAL PRIMARY KEY,
    key_name VARCHAR(100) UNIQUE NOT NULL,
    key_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE
);

-- Insert default encryption keys (keys should be managed externally in production)
INSERT INTO encryption_keys (key_name, key_version) 
VALUES 
    ('biometric_key', 1),
    ('personal_data_key', 1)
ON CONFLICT (key_name) DO NOTHING;

-- Add encrypted columns to employees table
ALTER TABLE employees 
ADD COLUMN IF NOT EXISTS national_id_encrypted BYTEA,
ADD COLUMN IF NOT EXISTS date_of_birth_encrypted BYTEA,
ADD COLUMN IF NOT EXISTS phone_encrypted BYTEA,
ADD COLUMN IF NOT EXISTS email_encrypted BYTEA,
ADD COLUMN IF NOT EXISTS encryption_version INTEGER DEFAULT 1;

-- Add encrypted columns to biometrics table
ALTER TABLE biometrics 
ADD COLUMN IF NOT EXISTS template_encrypted BYTEA,
ADD COLUMN IF NOT EXISTS encryption_version INTEGER DEFAULT 1;

-- Create function to encrypt personal data
CREATE OR REPLACE FUNCTION encrypt_personal_data(
    plaintext TEXT,
    key_password TEXT DEFAULT NULL
) RETURNS BYTEA AS $$
BEGIN
    IF plaintext IS NULL OR plaintext = '' THEN
        RETURN NULL;
    END IF;
    
    -- Use environment variable or provided key
    RETURN pgp_sym_encrypt(
        plaintext, 
        COALESCE(key_password, current_setting('app.personal_data_key', true), 'default_key'),
        'compress-algo=1, cipher-algo=aes256'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to decrypt personal data
CREATE OR REPLACE FUNCTION decrypt_personal_data(
    encrypted_data BYTEA,
    key_password TEXT DEFAULT NULL
) RETURNS TEXT AS $$
BEGIN
    IF encrypted_data IS NULL THEN
        RETURN NULL;
    END IF;
    
    -- Use environment variable or provided key
    RETURN pgp_sym_decrypt(
        encrypted_data, 
        COALESCE(key_password, current_setting('app.personal_data_key', true), 'default_key')
    );
EXCEPTION
    WHEN OTHERS THEN
        -- Log decryption failure and return NULL
        RAISE WARNING 'Decryption failed for personal data: %', SQLERRM;
        RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to encrypt biometric data
CREATE OR REPLACE FUNCTION encrypt_biometric_data(
    plaintext TEXT,
    key_password TEXT DEFAULT NULL
) RETURNS BYTEA AS $$
BEGIN
    IF plaintext IS NULL OR plaintext = '' THEN
        RETURN NULL;
    END IF;
    
    -- Use environment variable or provided key
    RETURN pgp_sym_encrypt(
        plaintext, 
        COALESCE(key_password, current_setting('app.biometric_key', true), 'default_biometric_key'),
        'compress-algo=1, cipher-algo=aes256'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to decrypt biometric data
CREATE OR REPLACE FUNCTION decrypt_biometric_data(
    encrypted_data BYTEA,
    key_password TEXT DEFAULT NULL
) RETURNS TEXT AS $$
BEGIN
    IF encrypted_data IS NULL THEN
        RETURN NULL;
    END IF;
    
    -- Use environment variable or provided key
    RETURN pgp_sym_decrypt(
        encrypted_data, 
        COALESCE(key_password, current_setting('app.biometric_key', true), 'default_biometric_key')
    );
EXCEPTION
    WHEN OTHERS THEN
        -- Log decryption failure and return NULL
        RAISE WARNING 'Decryption failed for biometric data: %', SQLERRM;
        RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger function to automatically encrypt data on insert/update
CREATE OR REPLACE FUNCTION encrypt_employee_data() RETURNS TRIGGER AS $$
BEGIN
    -- Encrypt national_id if provided and not already encrypted
    IF NEW.national_id IS NOT NULL AND NEW.national_id_encrypted IS NULL THEN
        NEW.national_id_encrypted := encrypt_personal_data(NEW.national_id);
        NEW.national_id := NULL; -- Clear plaintext
    END IF;
    
    -- Encrypt date_of_birth if provided and not already encrypted
    IF NEW.date_of_birth IS NOT NULL AND NEW.date_of_birth_encrypted IS NULL THEN
        NEW.date_of_birth_encrypted := encrypt_personal_data(NEW.date_of_birth::TEXT);
        NEW.date_of_birth := NULL; -- Clear plaintext
    END IF;
    
    -- Encrypt phone if provided and not already encrypted
    IF NEW.phone IS NOT NULL AND NEW.phone_encrypted IS NULL THEN
        NEW.phone_encrypted := encrypt_personal_data(NEW.phone);
        NEW.phone := NULL; -- Clear plaintext
    END IF;
    
    -- Encrypt email if provided and not already encrypted
    IF NEW.email IS NOT NULL AND NEW.email_encrypted IS NULL THEN
        NEW.email_encrypted := encrypt_personal_data(NEW.email);
        NEW.email := NULL; -- Clear plaintext
    END IF;
    
    -- Set encryption version
    NEW.encryption_version := 1;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger function to automatically encrypt biometric data
CREATE OR REPLACE FUNCTION encrypt_biometric_template() RETURNS TRIGGER AS $$
BEGIN
    -- Encrypt template_hash if provided and not already encrypted
    IF NEW.template_hash IS NOT NULL AND NEW.template_encrypted IS NULL THEN
        NEW.template_encrypted := encrypt_biometric_data(NEW.template_hash);
        NEW.template_hash := NULL; -- Clear plaintext
    END IF;
    
    -- Set encryption version
    NEW.encryption_version := 1;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
DROP TRIGGER IF EXISTS encrypt_employee_data_trigger ON employees;
CREATE TRIGGER encrypt_employee_data_trigger
    BEFORE INSERT OR UPDATE ON employees
    FOR EACH ROW
    EXECUTE FUNCTION encrypt_employee_data();

DROP TRIGGER IF EXISTS encrypt_biometric_template_trigger ON biometrics;
CREATE TRIGGER encrypt_biometric_template_trigger
    BEFORE INSERT OR UPDATE ON biometrics
    FOR EACH ROW
    EXECUTE FUNCTION encrypt_biometric_template();

-- Create view for decrypted employee data (for application use)
CREATE OR REPLACE VIEW employees_decrypted AS
SELECT 
    id,
    employee_id,
    first_name,
    last_name,
    CASE 
        WHEN national_id_encrypted IS NOT NULL THEN decrypt_personal_data(national_id_encrypted)
        ELSE national_id
    END AS national_id,
    CASE 
        WHEN date_of_birth_encrypted IS NOT NULL THEN decrypt_personal_data(date_of_birth_encrypted)::DATE
        ELSE date_of_birth
    END AS date_of_birth,
    CASE 
        WHEN phone_encrypted IS NOT NULL THEN decrypt_personal_data(phone_encrypted)
        ELSE phone
    END AS phone,
    CASE 
        WHEN email_encrypted IS NOT NULL THEN decrypt_personal_data(email_encrypted)
        ELSE email
    END AS email,
    department,
    position,
    hire_date,
    is_active,
    created_at,
    updated_at,
    encryption_version
FROM employees;

-- Create view for decrypted biometric data (for application use)
CREATE OR REPLACE VIEW biometrics_decrypted AS
SELECT 
    id,
    employee_id,
    CASE 
        WHEN template_encrypted IS NOT NULL THEN decrypt_biometric_data(template_encrypted)
        ELSE template_hash
    END AS template_hash,
    template_type,
    registered_at,
    is_active,
    encryption_version
FROM biometrics;

-- Create function to migrate existing data to encrypted format
CREATE OR REPLACE FUNCTION migrate_to_encrypted() RETURNS INTEGER AS $$
DECLARE
    employee_count INTEGER := 0;
    biometric_count INTEGER := 0;
BEGIN
    -- Migrate employee data
    UPDATE employees 
    SET 
        national_id_encrypted = encrypt_personal_data(national_id),
        date_of_birth_encrypted = encrypt_personal_data(date_of_birth::TEXT),
        phone_encrypted = encrypt_personal_data(phone),
        email_encrypted = encrypt_personal_data(email),
        encryption_version = 1
    WHERE 
        (national_id IS NOT NULL AND national_id_encrypted IS NULL) OR
        (date_of_birth IS NOT NULL AND date_of_birth_encrypted IS NULL) OR
        (phone IS NOT NULL AND phone_encrypted IS NULL) OR
        (email IS NOT NULL AND email_encrypted IS NULL);
    
    GET DIAGNOSTICS employee_count = ROW_COUNT;
    
    -- Clear plaintext data after encryption
    UPDATE employees 
    SET 
        national_id = NULL,
        date_of_birth = NULL,
        phone = NULL,
        email = NULL
    WHERE encryption_version = 1;
    
    -- Migrate biometric data
    UPDATE biometrics 
    SET 
        template_encrypted = encrypt_biometric_data(template_hash),
        encryption_version = 1
    WHERE template_hash IS NOT NULL AND template_encrypted IS NULL;
    
    GET DIAGNOSTICS biometric_count = ROW_COUNT;
    
    -- Clear plaintext template hashes after encryption
    UPDATE biometrics 
    SET template_hash = NULL
    WHERE encryption_version = 1;
    
    RAISE NOTICE 'Migration completed: % employees, % biometric records encrypted', 
                 employee_count, biometric_count;
    
    RETURN employee_count + biometric_count;
END;
$$ LANGUAGE plpgsql;

-- Create function to verify encryption status
CREATE OR REPLACE FUNCTION verify_encryption_status() RETURNS TABLE(
    table_name TEXT,
    total_records BIGINT,
    encrypted_records BIGINT,
    unencrypted_records BIGINT,
    encryption_percentage NUMERIC
) AS $$
BEGIN
    -- Check employees table
    RETURN QUERY
    SELECT 
        'employees'::TEXT,
        COUNT(*)::BIGINT,
        COUNT(CASE WHEN encryption_version >= 1 THEN 1 END)::BIGINT,
        COUNT(CASE WHEN encryption_version IS NULL OR encryption_version < 1 THEN 1 END)::BIGINT,
        ROUND(
            (COUNT(CASE WHEN encryption_version >= 1 THEN 1 END)::NUMERIC / COUNT(*)::NUMERIC) * 100, 
            2
        )
    FROM employees;
    
    -- Check biometrics table
    RETURN QUERY
    SELECT 
        'biometrics'::TEXT,
        COUNT(*)::BIGINT,
        COUNT(CASE WHEN encryption_version >= 1 THEN 1 END)::BIGINT,
        COUNT(CASE WHEN encryption_version IS NULL OR encryption_version < 1 THEN 1 END)::BIGINT,
        ROUND(
            (COUNT(CASE WHEN encryption_version >= 1 THEN 1 END)::NUMERIC / COUNT(*)::NUMERIC) * 100, 
            2
        )
    FROM biometrics;
END;
$$ LANGUAGE plpgsql;

-- Create audit table for encryption operations
CREATE TABLE IF NOT EXISTS encryption_audit (
    id SERIAL PRIMARY KEY,
    operation VARCHAR(50) NOT NULL,
    table_name VARCHAR(50) NOT NULL,
    record_id INTEGER,
    user_id VARCHAR(100),
    ip_address INET,
    timestamp TIMESTAMP DEFAULT NOW(),
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT
);

-- Create function to log encryption operations
CREATE OR REPLACE FUNCTION log_encryption_operation(
    p_operation VARCHAR(50),
    p_table_name VARCHAR(50),
    p_record_id INTEGER DEFAULT NULL,
    p_user_id VARCHAR(100) DEFAULT NULL,
    p_ip_address INET DEFAULT NULL,
    p_success BOOLEAN DEFAULT TRUE,
    p_error_message TEXT DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    INSERT INTO encryption_audit (
        operation, table_name, record_id, user_id, ip_address, success, error_message
    ) VALUES (
        p_operation, p_table_name, p_record_id, p_user_id, p_ip_address, p_success, p_error_message
    );
END;
$$ LANGUAGE plpgsql;

-- Create indexes for encrypted columns (for performance)
CREATE INDEX IF NOT EXISTS idx_employees_encrypted_version ON employees(encryption_version);
CREATE INDEX IF NOT EXISTS idx_biometrics_encrypted_version ON biometrics(encryption_version);

-- Create function to rotate encryption keys (for future use)
CREATE OR REPLACE FUNCTION rotate_encryption_key(
    key_name VARCHAR(100),
    new_key_password TEXT
) RETURNS INTEGER AS $$
DECLARE
    affected_records INTEGER := 0;
BEGIN
    -- This function would re-encrypt data with new keys
    -- Implementation depends on specific key rotation strategy
    
    -- Update key version
    UPDATE encryption_keys 
    SET 
        key_version = key_version + 1,
        created_at = NOW()
    WHERE key_name = rotate_encryption_key.key_name;
    
    -- Log key rotation
    PERFORM log_encryption_operation(
        'KEY_ROTATION',
        'encryption_keys',
        NULL,
        current_user,
        NULL,
        TRUE,
        'Key rotated: ' || key_name
    );
    
    RETURN affected_records;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO attendance_user;
GRANT SELECT ON employees_decrypted TO attendance_user;
GRANT SELECT ON biometrics_decrypted TO attendance_user;
GRANT INSERT, UPDATE, DELETE ON employees TO attendance_user;
GRANT INSERT, UPDATE, DELETE ON biometrics TO attendance_user;
GRANT SELECT ON encryption_keys TO attendance_user;
GRANT INSERT ON encryption_audit TO attendance_user;

-- Security: Revoke direct access to encrypted columns from application user
REVOKE SELECT ON employees FROM attendance_user;
REVOKE SELECT ON biometrics FROM attendance_user;

-- Create role for encryption management (for DBAs only)
CREATE ROLE encryption_admin;
GRANT ALL ON encryption_keys TO encryption_admin;
GRANT ALL ON encryption_audit TO encryption_admin;
GRANT EXECUTE ON FUNCTION migrate_to_encrypted() TO encryption_admin;
GRANT EXECUTE ON FUNCTION rotate_encryption_key(VARCHAR, TEXT) TO encryption_admin;

-- Comments for documentation
COMMENT ON FUNCTION encrypt_personal_data(TEXT, TEXT) IS 'Encrypts personal data using AES-256';
COMMENT ON FUNCTION decrypt_personal_data(BYTEA, TEXT) IS 'Decrypts personal data encrypted with encrypt_personal_data';
COMMENT ON FUNCTION encrypt_biometric_data(TEXT, TEXT) IS 'Encrypts biometric template data using AES-256';
COMMENT ON FUNCTION decrypt_biometric_data(BYTEA, TEXT) IS 'Decrypts biometric data encrypted with encrypt_biometric_data';
COMMENT ON VIEW employees_decrypted IS 'Decrypted view of employee data for application use';
COMMENT ON VIEW biometrics_decrypted IS 'Decrypted view of biometric data for application use';
COMMENT ON FUNCTION migrate_to_encrypted() IS 'Migrates existing plaintext data to encrypted format';
COMMENT ON FUNCTION verify_encryption_status() IS 'Returns encryption status for all tables';

-- Final verification query (run after migration)
-- SELECT * FROM verify_encryption_status();
