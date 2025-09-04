
-- AttendanceAPI Database Security Hardening
-- Implements comprehensive database security measures
-- 
-- Security Features:
-- - Row-level security (RLS)
-- - Audit logging for all data access
-- - Secure user roles and permissions
-- - Database activity monitoring
-- - Data retention policies

-- Enable row-level security on sensitive tables
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE biometrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_credentials ENABLE ROW LEVEL SECURITY;

-- Create security roles
CREATE ROLE attendance_read_only;
CREATE ROLE attendance_app_user;
CREATE ROLE attendance_admin;
CREATE ROLE attendance_auditor;

-- Create audit schema for security logs
CREATE SCHEMA IF NOT EXISTS audit;

-- Create comprehensive audit table
CREATE TABLE IF NOT EXISTS audit.data_access_log (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMP DEFAULT NOW(),
    user_name TEXT NOT NULL,
    database_name TEXT NOT NULL,
    schema_name TEXT,
    table_name TEXT,
    operation TEXT NOT NULL, -- SELECT, INSERT, UPDATE, DELETE
    row_id TEXT,
    old_values JSONB,
    new_values JSONB,
    query TEXT,
    client_ip INET,
    application_name TEXT,
    session_id TEXT,
    correlation_id TEXT,
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT
);

-- Create security events table
CREATE TABLE IF NOT EXISTS audit.security_events (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMP DEFAULT NOW(),
    event_type TEXT NOT NULL,
    severity TEXT NOT NULL, -- LOW, MEDIUM, HIGH, CRITICAL
    user_name TEXT,
    client_ip INET,
    description TEXT NOT NULL,
    additional_data JSONB,
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP,
    resolved_by TEXT
);

-- Create login attempts tracking
CREATE TABLE IF NOT EXISTS audit.login_attempts (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMP DEFAULT NOW(),
    user_name TEXT NOT NULL,
    client_ip INET,
    user_agent TEXT,
    success BOOLEAN NOT NULL,
    failure_reason TEXT,
    session_id TEXT
);

-- Create function to log data access
CREATE OR REPLACE FUNCTION audit.log_data_access(
    p_operation TEXT,
    p_schema_name TEXT,
    p_table_name TEXT,
    p_row_id TEXT DEFAULT NULL,
    p_old_values JSONB DEFAULT NULL,
    p_new_values JSONB DEFAULT NULL,
    p_correlation_id TEXT DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    INSERT INTO audit.data_access_log (
        user_name,
        database_name,
        schema_name,
        table_name,
        operation,
        row_id,
        old_values,
        new_values,
        query,
        client_ip,
        application_name,
        correlation_id
    ) VALUES (
        current_user,
        current_database(),
        p_schema_name,
        p_table_name,
        p_operation,
        p_row_id,
        p_old_values,
        p_new_values,
        current_query(),
        inet_client_addr(),
        current_setting('application_name', true),
        p_correlation_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to log security events
CREATE OR REPLACE FUNCTION audit.log_security_event(
    p_event_type TEXT,
    p_severity TEXT,
    p_description TEXT,
    p_additional_data JSONB DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    INSERT INTO audit.security_events (
        event_type,
        severity,
        user_name,
        client_ip,
        description,
        additional_data
    ) VALUES (
        p_event_type,
        p_severity,
        current_user,
        inet_client_addr(),
        p_description,
        p_additional_data
    );
    
    -- Alert on critical events
    IF p_severity = 'CRITICAL' THEN
        RAISE WARNING 'CRITICAL SECURITY EVENT: % - %', p_event_type, p_description;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create audit trigger function for employees table
CREATE OR REPLACE FUNCTION audit.employees_audit_trigger() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM audit.log_data_access(
            'DELETE',
            TG_TABLE_SCHEMA,
            TG_TABLE_NAME,
            OLD.id::TEXT,
            row_to_json(OLD)::JSONB,
            NULL,
            current_setting('app.correlation_id', true)
        );
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        PERFORM audit.log_data_access(
            'UPDATE',
            TG_TABLE_SCHEMA,
            TG_TABLE_NAME,
            NEW.id::TEXT,
            row_to_json(OLD)::JSONB,
            row_to_json(NEW)::JSONB,
            current_setting('app.correlation_id', true)
        );
        RETURN NEW;
    ELSIF TG_OP = 'INSERT' THEN
        PERFORM audit.log_data_access(
            'INSERT',
            TG_TABLE_SCHEMA,
            TG_TABLE_NAME,
            NEW.id::TEXT,
            NULL,
            row_to_json(NEW)::JSONB,
            current_setting('app.correlation_id', true)
        );
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create audit trigger function for biometrics table
CREATE OR REPLACE FUNCTION audit.biometrics_audit_trigger() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM audit.log_data_access(
            'DELETE',
            TG_TABLE_SCHEMA,
            TG_TABLE_NAME,
            OLD.id::TEXT,
            jsonb_build_object('employee_id', OLD.employee_id, 'template_type', OLD.template_type),
            NULL,
            current_setting('app.correlation_id', true)
        );
        -- Log security event for biometric deletion
        PERFORM audit.log_security_event(
            'BIOMETRIC_DELETED',
            'HIGH',
            'Biometric template deleted for employee: ' || OLD.employee_id,
            jsonb_build_object('employee_id', OLD.employee_id, 'template_type', OLD.template_type)
        );
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        PERFORM audit.log_data_access(
            'UPDATE',
            TG_TABLE_SCHEMA,
            TG_TABLE_NAME,
            NEW.id::TEXT,
            jsonb_build_object('employee_id', OLD.employee_id, 'template_type', OLD.template_type),
            jsonb_build_object('employee_id', NEW.employee_id, 'template_type', NEW.template_type),
            current_setting('app.correlation_id', true)
        );
        RETURN NEW;
    ELSIF TG_OP = 'INSERT' THEN
        PERFORM audit.log_data_access(
            'INSERT',
            TG_TABLE_SCHEMA,
            TG_TABLE_NAME,
            NEW.id::TEXT,
            NULL,
            jsonb_build_object('employee_id', NEW.employee_id, 'template_type', NEW.template_type),
            current_setting('app.correlation_id', true)
        );
        -- Log security event for biometric registration
        PERFORM audit.log_security_event(
            'BIOMETRIC_REGISTERED',
            'MEDIUM',
            'New biometric template registered for employee: ' || NEW.employee_id,
            jsonb_build_object('employee_id', NEW.employee_id, 'template_type', NEW.template_type)
        );
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create audit trigger function for attendance table
CREATE OR REPLACE FUNCTION audit.attendance_audit_trigger() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM audit.log_data_access(
            'DELETE',
            TG_TABLE_SCHEMA,
            TG_TABLE_NAME,
            OLD.id::TEXT,
            row_to_json(OLD)::JSONB,
            NULL,
            current_setting('app.correlation_id', true)
        );
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        PERFORM audit.log_data_access(
            'UPDATE',
            TG_TABLE_SCHEMA,
            TG_TABLE_NAME,
            NEW.id::TEXT,
            row_to_json(OLD)::JSONB,
            row_to_json(NEW)::JSONB,
            current_setting('app.correlation_id', true)
        );
        RETURN NEW;
    ELSIF TG_OP = 'INSERT' THEN
        PERFORM audit.log_data_access(
            'INSERT',
            TG_TABLE_SCHEMA,
            TG_TABLE_NAME,
            NEW.id::TEXT,
            NULL,
            row_to_json(NEW)::JSONB,
            current_setting('app.correlation_id', true)
        );
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers for audit logging
DROP TRIGGER IF EXISTS employees_audit_trigger ON employees;
CREATE TRIGGER employees_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON employees
    FOR EACH ROW EXECUTE FUNCTION audit.employees_audit_trigger();

DROP TRIGGER IF EXISTS biometrics_audit_trigger ON biometrics;
CREATE TRIGGER biometrics_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON biometrics
    FOR EACH ROW EXECUTE FUNCTION audit.biometrics_audit_trigger();

DROP TRIGGER IF EXISTS attendance_audit_trigger ON attendance;
CREATE TRIGGER attendance_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON attendance
    FOR EACH ROW EXECUTE FUNCTION audit.attendance_audit_trigger();

-- Create row-level security policies

-- Employees RLS policies
CREATE POLICY employees_select_policy ON employees
    FOR SELECT
    USING (
        -- Allow access to own data or if user has admin role
        current_user = 'attendance_admin' OR
        current_user = 'attendance_app_user' OR
        employee_id = current_setting('app.current_employee_id', true)
    );

CREATE POLICY employees_insert_policy ON employees
    FOR INSERT
    WITH CHECK (
        current_user = 'attendance_admin' OR
        current_user = 'attendance_app_user'
    );

CREATE POLICY employees_update_policy ON employees
    FOR UPDATE
    USING (
        current_user = 'attendance_admin' OR
        current_user = 'attendance_app_user'
    );

CREATE POLICY employees_delete_policy ON employees
    FOR DELETE
    USING (current_user = 'attendance_admin');

-- Biometrics RLS policies
CREATE POLICY biometrics_select_policy ON biometrics
    FOR SELECT
    USING (
        current_user = 'attendance_admin' OR
        current_user = 'attendance_app_user' OR
        employee_id = current_setting('app.current_employee_id', true)
    );

CREATE POLICY biometrics_insert_policy ON biometrics
    FOR INSERT
    WITH CHECK (
        current_user = 'attendance_admin' OR
        current_user = 'attendance_app_user'
    );

CREATE POLICY biometrics_update_policy ON biometrics
    FOR UPDATE
    USING (
        current_user = 'attendance_admin' OR
        current_user = 'attendance_app_user'
    );

CREATE POLICY biometrics_delete_policy ON biometrics
    FOR DELETE
    USING (current_user = 'attendance_admin');

-- Attendance RLS policies
CREATE POLICY attendance_select_policy ON attendance
    FOR SELECT
    USING (
        current_user = 'attendance_admin' OR
        current_user = 'attendance_app_user' OR
        employee_id = current_setting('app.current_employee_id', true)
    );

CREATE POLICY attendance_insert_policy ON attendance
    FOR INSERT
    WITH CHECK (
        current_user = 'attendance_admin' OR
        current_user = 'attendance_app_user'
    );

CREATE POLICY attendance_update_policy ON attendance
    FOR UPDATE
    USING (
        current_user = 'attendance_admin' OR
        current_user = 'attendance_app_user'
    );

CREATE POLICY attendance_delete_policy ON attendance
    FOR DELETE
    USING (current_user = 'attendance_admin');

-- Device credentials RLS policies
CREATE POLICY device_credentials_select_policy ON device_credentials
    FOR SELECT
    USING (
        current_user = 'attendance_admin' OR
        current_user = 'attendance_app_user'
    );

CREATE POLICY device_credentials_insert_policy ON device_credentials
    FOR INSERT
    WITH CHECK (current_user = 'attendance_admin');

CREATE POLICY device_credentials_update_policy ON device_credentials
    FOR UPDATE
    USING (current_user = 'attendance_admin');

CREATE POLICY device_credentials_delete_policy ON device_credentials
    FOR DELETE
    USING (current_user = 'attendance_admin');

-- Create function to detect suspicious activity
CREATE OR REPLACE FUNCTION audit.detect_suspicious_activity() RETURNS VOID AS $$
DECLARE
    suspicious_logins INTEGER;
    bulk_operations INTEGER;
    off_hours_access INTEGER;
BEGIN
    -- Check for multiple failed login attempts
    SELECT COUNT(*) INTO suspicious_logins
    FROM audit.login_attempts
    WHERE timestamp > NOW() - INTERVAL '1 hour'
      AND success = FALSE
      AND client_ip = inet_client_addr();
    
    IF suspicious_logins >= 5 THEN
        PERFORM audit.log_security_event(
            'SUSPICIOUS_LOGIN_ATTEMPTS',
            'HIGH',
            'Multiple failed login attempts detected',
            jsonb_build_object('attempts', suspicious_logins, 'ip', inet_client_addr())
        );
    END IF;
    
    -- Check for bulk operations
    SELECT COUNT(*) INTO bulk_operations
    FROM audit.data_access_log
    WHERE timestamp > NOW() - INTERVAL '5 minutes'
      AND user_name = current_user
      AND operation IN ('INSERT', 'UPDATE', 'DELETE');
    
    IF bulk_operations >= 100 THEN
        PERFORM audit.log_security_event(
            'BULK_OPERATIONS_DETECTED',
            'MEDIUM',
            'High volume of data modifications detected',
            jsonb_build_object('operations', bulk_operations, 'user', current_user)
        );
    END IF;
    
    -- Check for off-hours access (outside 6 AM - 10 PM)
    IF EXTRACT(HOUR FROM NOW()) < 6 OR EXTRACT(HOUR FROM NOW()) > 22 THEN
        PERFORM audit.log_security_event(
            'OFF_HOURS_ACCESS',
            'MEDIUM',
            'Database access during off-hours',
            jsonb_build_object('hour', EXTRACT(HOUR FROM NOW()), 'user', current_user)
        );
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to clean up old audit logs
CREATE OR REPLACE FUNCTION audit.cleanup_old_logs(retention_days INTEGER DEFAULT 90) RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete old data access logs
    DELETE FROM audit.data_access_log
    WHERE timestamp < NOW() - (retention_days || ' days')::INTERVAL;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Delete old resolved security events
    DELETE FROM audit.security_events
    WHERE timestamp < NOW() - (retention_days || ' days')::INTERVAL
      AND resolved = TRUE;
    
    -- Delete old login attempts
    DELETE FROM audit.login_attempts
    WHERE timestamp < NOW() - (retention_days || ' days')::INTERVAL;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to generate security report
CREATE OR REPLACE FUNCTION audit.generate_security_report(
    start_date TIMESTAMP DEFAULT NOW() - INTERVAL '7 days',
    end_date TIMESTAMP DEFAULT NOW()
) RETURNS TABLE(
    metric TEXT,
    count BIGINT,
    details JSONB
) AS $$
BEGIN
    -- Total data access operations
    RETURN QUERY
    SELECT 
        'total_data_access'::TEXT,
        COUNT(*)::BIGINT,
        jsonb_build_object(
            'period', jsonb_build_object('start', start_date, 'end', end_date)
        )
    FROM audit.data_access_log
    WHERE timestamp BETWEEN start_date AND end_date;
    
    -- Failed login attempts
    RETURN QUERY
    SELECT 
        'failed_logins'::TEXT,
        COUNT(*)::BIGINT,
        jsonb_build_object(
            'unique_ips', (
                SELECT COUNT(DISTINCT client_ip)
                FROM audit.login_attempts
                WHERE timestamp BETWEEN start_date AND end_date
                  AND success = FALSE
            )
        )
    FROM audit.login_attempts
    WHERE timestamp BETWEEN start_date AND end_date
      AND success = FALSE;
    
    -- Security events by severity
    RETURN QUERY
    SELECT 
        'security_events_' || LOWER(severity),
        COUNT(*)::BIGINT,
        jsonb_build_object(
            'resolved', COUNT(CASE WHEN resolved THEN 1 END),
            'unresolved', COUNT(CASE WHEN NOT resolved THEN 1 END)
        )
    FROM audit.security_events
    WHERE timestamp BETWEEN start_date AND end_date
    GROUP BY severity;
    
    -- Top users by activity
    RETURN QUERY
    SELECT 
        'top_active_users'::TEXT,
        COUNT(DISTINCT user_name)::BIGINT,
        jsonb_agg(
            jsonb_build_object(
                'user', user_name,
                'operations', operation_count
            )
        )
    FROM (
        SELECT 
            user_name,
            COUNT(*) as operation_count
        FROM audit.data_access_log
        WHERE timestamp BETWEEN start_date AND end_date
        GROUP BY user_name
        ORDER BY COUNT(*) DESC
        LIMIT 10
    ) top_users;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions to roles

-- Read-only role
GRANT USAGE ON SCHEMA public TO attendance_read_only;
GRANT SELECT ON employees_decrypted TO attendance_read_only;
GRANT SELECT ON biometrics_decrypted TO attendance_read_only;
GRANT SELECT ON attendance TO attendance_read_only;

-- Application user role
GRANT USAGE ON SCHEMA public TO attendance_app_user;
GRANT SELECT, INSERT, UPDATE ON employees TO attendance_app_user;
GRANT SELECT, INSERT, UPDATE ON biometrics TO attendance_app_user;
GRANT SELECT, INSERT, UPDATE ON attendance TO attendance_app_user;
GRANT SELECT ON employees_decrypted TO attendance_app_user;
GRANT SELECT ON biometrics_decrypted TO attendance_app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO attendance_app_user;

-- Admin role
GRANT ALL ON ALL TABLES IN SCHEMA public TO attendance_admin;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO attendance_admin;
GRANT ALL ON SCHEMA audit TO attendance_admin;
GRANT ALL ON ALL TABLES IN SCHEMA audit TO attendance_admin;

-- Auditor role
GRANT USAGE ON SCHEMA audit TO attendance_auditor;
GRANT SELECT ON ALL TABLES IN SCHEMA audit TO attendance_auditor;
GRANT EXECUTE ON FUNCTION audit.generate_security_report(TIMESTAMP, TIMESTAMP) TO attendance_auditor;

-- Create indexes for audit tables (performance)
CREATE INDEX IF NOT EXISTS idx_data_access_log_timestamp ON audit.data_access_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_data_access_log_user ON audit.data_access_log(user_name);
CREATE INDEX IF NOT EXISTS idx_data_access_log_table ON audit.data_access_log(table_name);
CREATE INDEX IF NOT EXISTS idx_security_events_timestamp ON audit.security_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON audit.security_events(severity);
CREATE INDEX IF NOT EXISTS idx_login_attempts_timestamp ON audit.login_attempts(timestamp);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON audit.login_attempts(client_ip);

-- Create scheduled job for suspicious activity detection (requires pg_cron extension)
-- SELECT cron.schedule('detect-suspicious-activity', '*/5 * * * *', 'SELECT audit.detect_suspicious_activity();');

-- Create scheduled job for log cleanup (requires pg_cron extension)
-- SELECT cron.schedule('cleanup-audit-logs', '0 2 * * 0', 'SELECT audit.cleanup_old_logs(90);');

-- Final security settings
ALTER DATABASE attendance_api SET log_statement = 'all';
ALTER DATABASE attendance_api SET log_min_duration_statement = 1000; -- Log slow queries
ALTER DATABASE attendance_api SET log_connections = on;
ALTER DATABASE attendance_api SET log_disconnections = on;
ALTER DATABASE attendance_api SET log_lock_waits = on;

-- Comments for documentation
COMMENT ON SCHEMA audit IS 'Schema for security audit logs and monitoring';
COMMENT ON TABLE audit.data_access_log IS 'Comprehensive audit log for all data access operations';
COMMENT ON TABLE audit.security_events IS 'Security events and incidents tracking';
COMMENT ON TABLE audit.login_attempts IS 'Login attempts tracking for security monitoring';
COMMENT ON FUNCTION audit.detect_suspicious_activity() IS 'Automated suspicious activity detection';
COMMENT ON FUNCTION audit.cleanup_old_logs(INTEGER) IS 'Cleanup old audit logs based on retention policy';
COMMENT ON FUNCTION audit.generate_security_report(TIMESTAMP, TIMESTAMP) IS 'Generate comprehensive security report';
