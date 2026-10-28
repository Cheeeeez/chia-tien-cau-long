FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:24-bookworm-slim
ENV NODE_ENV=production DATA_DIR=/data PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app
COPY package.json package-lock.json ./
# Chỉ cài chromium-headless-shell (đủ cho headless: true) cùng thư viện hệ thống của nó, không kéo Firefox/WebKit.
# Phiên bản playwright pin ở package.json quyết định bản trình duyệt được tải.
RUN npm ci --omit=dev \
  && npx playwright install --with-deps --only-shell chromium \
  && rm -rf /var/lib/apt/lists/* /root/.npm
COPY --from=build /app/dist ./dist
# uid 1001 giữ nguyên như image cũ để đọc được volume /data đã lưu (file chmod 600).
RUN groupadd -g 1001 pwuser && useradd -u 1001 -g 1001 -m pwuser \
  && mkdir /data && chown pwuser:pwuser /data
VOLUME /data
EXPOSE 8787
USER pwuser
CMD ["node", "dist/index.js"]
