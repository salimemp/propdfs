"""Pytest configuration.

Set fake AWS credentials + patch boto3 before the app module is
imported, otherwise `app/services/storage_service.py` blows up at module
load — first with "NoCredentialsError", then once creds are set, with
"EndpointConnectionError" when it tries to ensure the bucket exists
against the real R2/S3 endpoint.

We also stub out the secret key to a known dev value so JWT signing
is deterministic in tests.
"""
import os
from unittest.mock import MagicMock

# Fake AWS credentials — never actually used, but required to silence
# boto3's "NoCredentialsError" at module-load time.
os.environ.setdefault("AWS_ACCESS_KEY_ID", "test")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "test")
os.environ.setdefault("AWS_SESSION_TOKEN", "test")

# 32+ char deterministic secret for JWT signing in tests.
os.environ.setdefault("SECRET_KEY", "test-secret-key-32-chars-long-string")

# Patch boto3.client so storage_service.__init__ doesn't actually try
# to talk to S3/R2 during test collection. The tests that need real
# storage behaviour should mock `storage_service` directly.
import boto3  # noqa: E402

_boto3_client_mock = MagicMock(name="boto3.client")
_boto3_client_mock.return_value.head_bucket.return_value = {}
_boto3_client_mock.return_value.create_bucket.return_value = {}
boto3.client = _boto3_client_mock  # type: ignore[assignment] 
