
# Gunicorn Configuration for AttendanceAPI Production
import multiprocessing
import os

# Server socket
bind = "127.0.0.1:8000"
backlog = 2048

# Worker processes
workers = multiprocessing.cpu_count() * 2 + 1  # 9-11 for i5 processor
worker_class = "sync"
worker_connections = 1000
max_requests = 1000
max_requests_jitter = 50
preload_app = True
timeout = 30
keepalive = 2

# Logging
accesslog = "/var/log/attendance-api/access.log"
errorlog = "/var/log/attendance-api/error.log"
loglevel = "info"
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" %(D)s'

# Process naming
proc_name = 'attendance-api'

# Server mechanics
daemon = False
pidfile = '/var/run/attendance-api/attendance-api.pid'
user = 'www-data'
group = 'www-data'
tmp_upload_dir = None

# SSL (if needed)
# keyfile = '/etc/ssl/private/attendance-api.key'
# certfile = '/etc/ssl/certs/attendance-api.crt'

# Memory optimization
max_requests_jitter = 100
worker_tmp_dir = '/dev/shm'

# Performance tuning
preload_app = True
enable_stdio_inheritance = True

def when_ready(server):
    server.log.info("AttendanceAPI server is ready. Spawning workers")

def worker_int(worker):
    worker.log.info("worker received INT or QUIT signal")

def pre_fork(server, worker):
    server.log.info("Worker spawned (pid: %s)", worker.pid)

def post_fork(server, worker):
    server.log.info("Worker spawned (pid: %s)", worker.pid)
