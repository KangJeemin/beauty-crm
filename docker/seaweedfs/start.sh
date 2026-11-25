#!/bin/sh
# SeaweedFS 단일 노드 실행 (master + volume + filer + S3 게이트웨이)
set -e
: "${STORAGE_ACCESS_KEY:?STORAGE_ACCESS_KEY 가 필요합니다}"
: "${STORAGE_SECRET_KEY:?STORAGE_SECRET_KEY 가 필요합니다}"

mkdir -p /data
cat > /tmp/s3.json <<JSON
{
  "identities": [
    {
      "name": "app",
      "credentials": [{ "accessKey": "${STORAGE_ACCESS_KEY}", "secretKey": "${STORAGE_SECRET_KEY}" }],
      "actions": ["Admin", "Read", "List", "Tagging", "Write"]
    }
  ]
}
JSON

exec weed server \
  -dir=/data \
  -ip.bind=0.0.0.0 \
  -master.volumeSizeLimitMB=1024 \
  -volume.max=0 \
  -s3 \
  -s3.port=8333 \
  -s3.config=/tmp/s3.json
