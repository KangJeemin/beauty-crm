import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone', // Docker 이미지 크기 최소화 (서버 이전 시 그대로 사용)
  outputFileTracingRoot: resolve(__dirname, '../..'),
  transpilePackages: ['@beauty-crm/shared'],
  reactStrictMode: true,
};

export default nextConfig;
