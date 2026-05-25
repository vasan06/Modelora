"""Gunicorn settings for handling concurrent Modelora users."""
import multiprocessing
import os

workers = int(os.environ.get("WEB_CONCURRENCY", max(2, multiprocessing.cpu_count())))
threads = int(os.environ.get("REQUEST_THREADS", "8"))
timeout = int(os.environ.get("REQUEST_TIMEOUT", "120"))
graceful_timeout = int(os.environ.get("GRACEFUL_TIMEOUT", "30"))
keepalive = int(os.environ.get("KEEPALIVE", "5"))
bind = os.environ.get("BIND", "0.0.0.0:5000")
worker_class = "gthread"
max_requests = int(os.environ.get("MAX_REQUESTS", "1000"))
max_requests_jitter = int(os.environ.get("MAX_REQUESTS_JITTER", "100"))

