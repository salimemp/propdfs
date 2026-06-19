import os
import uuid
from datetime import datetime, timezone
from typing import List, Optional
from pathlib import Path

import boto3
import structlog
from botocore.exceptions import ClientError
from fastapi import UploadFile

from app.core.config import get_settings

logger = structlog.get_logger()
settings = get_settings()


class StorageService:
    """S3-compatible storage service (Cloudflare R2 / AWS S3)."""

    def __init__(self):
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.STORAGE_ENDPOINT or None,
            aws_access_key_id=settings.STORAGE_ACCESS_KEY or None,
            aws_secret_access_key=settings.STORAGE_SECRET_KEY or None,
            region_name=settings.STORAGE_REGION,
        )
        self.bucket = settings.STORAGE_BUCKET
        self._ensure_bucket()

    def _ensure_bucket(self):
        try:
            self.client.head_bucket(Bucket=self.bucket)
        except ClientError as e:
            error_code = e.response["Error"]["Code"]
            if error_code == "404":
                self.client.create_bucket(Bucket=self.bucket)
                logger.info("storage_bucket_created", bucket=self.bucket)
            else:
                logger.warning("storage_bucket_check_failed", error=str(e))

    def _generate_key(self, user_id: str, filename: str) -> str:
        ext = Path(filename).suffix
        return f"users/{user_id}/{uuid.uuid4().hex}{ext}"

    async def upload_file(
        self, user_id: str, file: UploadFile, key: Optional[str] = None
    ) -> str:
        key = key or self._generate_key(user_id, file.filename or "document.pdf")
        content = await file.read()
        await file.seek(0)

        self.client.put_object(
            Bucket=self.bucket,
            Key=key,
            Body=content,
            ContentType=file.content_type or "application/octet-stream",
            Metadata={"uploaded_by": user_id, "original_name": file.filename or "unknown"},
        )
        logger.info("file_uploaded", key=key, user_id=user_id, size=len(content))
        return key

    def upload_bytes(self, user_id: str, data: bytes, filename: str, key: Optional[str] = None) -> str:
        key = key or self._generate_key(user_id, filename)
        self.client.put_object(
            Bucket=self.bucket,
            Key=key,
            Body=data,
            ContentType="application/pdf",
            Metadata={"uploaded_by": user_id, "original_name": filename},
        )
        logger.info("bytes_uploaded", key=key, user_id=user_id, size=len(data))
        return key

    def get_presigned_url(self, key: str, expires_in: int = 3600, download: bool = False) -> str:
        params = {"Bucket": self.bucket, "Key": key}
        if download:
            params["ResponseContentDisposition"] = f"attachment; filename={Path(key).name}"
        return self.client.generate_presigned_url(
            "get_object", Params=params, ExpiresIn=expires_in
        )

    def delete_file(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=key)
        logger.info("file_deleted", key=key)

    def get_file_size(self, key: str) -> int:
        response = self.client.head_object(Bucket=self.bucket, Key=key)
        return response["ContentLength"]

    def download_file(self, key: str, local_path: str) -> None:
        self.client.download_file(self.bucket, key, local_path)


storage_service = StorageService()
