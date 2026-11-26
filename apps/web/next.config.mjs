import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone', // Docker 이미지 크기 최소화 (서버 이전 시 그대로 사용)
  outputFileTracingRoot: resolve(__dirname, '../..'),
  transpilePackages: ['@beauty-crm/shared'],
  reactStrictMode: true,
  async headers() {
    return [
      // 서비스 워커는 항상 새로 받아야 업데이트가 바로 반영된다
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }] },
      { source: '/manifest.webmanifest', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
    ];
  },
};

export default nextConfig;
