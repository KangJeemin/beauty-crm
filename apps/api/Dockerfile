# 빌드 컨텍스트: 모노레포 루트 (docker compose 에서 context: .)
FROM node:22-alpine AS build
WORKDIR /repo
COPY . .
RUN npm ci \
 && npm run build -w @beauty-crm/shared \
 && npm run build -w @beauty-crm/api

FROM node:22-alpine
ENV NODE_ENV=production TZ=Asia/Seoul
WORKDIR /app
# api 와 shared 의 운영 의존성만 설치 (web 의 next/react 는 제외)
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN npm ci --omit=dev -w @beauty-crm/api -w @beauty-crm/shared && npm cache clean --force
COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/apps/api/dist apps/api/dist
WORKDIR /app/apps/api
EXPOSE 4000
# 시작할 때 밀린 마이그레이션을 먼저 적용한 뒤 서버 실행
CMD ["sh", "-c", "node /app/node_modules/typeorm/cli.js migration:run -d dist/database/data-source.js && node dist/main.js"]
