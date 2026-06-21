"""Pytest configuration.

Set fake AWS credentials before the app module is imported, otherwise
`app/services/storage_service.py` blows up at module load when boto3
tries to find credentials.

We also stub out the secret key to a known dev value so JWT signing
is deterministic in tests.
"""
import os

# Fake AWS credentials — never used (tests mock the storage service),
# but required to silence boto3's "NoCredentialsError" at import time.
os.environ.setdefault("AWS_ACCESS_KEY_ID", "test")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "test")
os.environ.setdefault("AWS_SESSION_TOKEN", "test")

# 32+ char deterministic secret for JWT signing in tests.
os.environ.setdefault("SECRET_KEY", "test-secret-key-32-chars-long-string")
