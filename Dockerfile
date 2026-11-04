# 科应共享账号管理平台 —— CloudBase 云托管生产镜像（单容器：前端静态 + NestJS API）
#
# 设计要点：
#  1. 一个容器、一个监听端口（CloudBase 云托管只允许一个端口，且不支持 Compose）：
#     前端产物由后端进程在 /api 之外的路径上托管（WEB_DIST_DIR）。
#  2. 构建期完成 pnpm install 与 tsc/vite 编译，运行期不含源码构建工具链。
#  3. Chromium 只为「管理员重置科应密码」Worker 准备（SCIENCING_BROWSER_CHANNEL=chromium）。
#  4. 密钥、业务数据一律不进镜像：DATABASE_PATH 指向挂载的 /data，
#     环境变量由云托管控制台注入（见 deploy-cloudbase/.env.example）。
#  5. 运行期以 root 启动以便写入平台挂载的 CFS 目录；可用 RUN_AS_NONROOT=1 降权。

ARG NODE_IMAGE=node:22-bookworm-slim

# ───────────────────────── 构建阶段 ─────────────────────────
FROM ${NODE_IMAGE} AS build
ARG NPM_REGISTRY=https://registry.npmmirror.com
ARG APP_VERSION=0.1.0

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=1
WORKDIR /app

# 直接装固定版本 pnpm：corepack 需要联网解析 packageManager，且对 pnpm 11 支持取决于 corepack 版本，
# 在云托管构建机这种不可控环境里更容易失败。
# 默认走 npmmirror：云托管控制台构建**无法传 build-arg**，默认值必须是国内可达的地址，
# 否则控制台构建会卡在 pnpm install。海外环境可用 --build-arg NPM_REGISTRY=https://registry.npmjs.org 覆盖。
RUN npm install -g pnpm@11.20.0 --registry="${NPM_REGISTRY}"

# 先只拷清单，最大化复用依赖缓存层
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY apps/extension/package.json apps/extension/
COPY packages/shared/package.json packages/shared/
COPY playwright/worker/package.json playwright/worker/

RUN pnpm config set registry "${NPM_REGISTRY}" \
    && pnpm install --frozen-lockfile

COPY . .

RUN pnpm --filter @scienceing/server build \
    && pnpm --filter @scienceing/web build \
    && pnpm --filter @scienceing/playwright-worker build

# 把版本号写进产物目录，运行期由 /api/health 与扩展包元信息使用
RUN printf '%s\n' "${APP_VERSION}" > /app/apps/server/dist/.app-version

# ───────────────────────── 运行阶段 ─────────────────────────
FROM ${NODE_IMAGE} AS runtime
ARG NPM_REGISTRY=https://registry.npmmirror.com
ARG APP_VERSION=0.1.0
ARG PLAYWRIGHT_DOWNLOAD_HOST=https://cdn.npmmirror.com/binaries/playwright
# Debian 官方源在国内极慢（实测 10 分钟只下到 12 个包，111 个包必然超时），换成国内镜像。
# 海外构建可传 --build-arg APT_MIRROR= 关闭替换，恢复 deb.debian.org。
ARG APT_MIRROR=https://mirrors.aliyun.com
# 首次验证镜像体积/构建时长时可以先设 false 跳过 Chromium（代价：管理员「重置科应密码」不可用）
ARG INSTALL_CHROMIUM=true

ENV NODE_ENV=production \
    TZ=Asia/Shanghai \
    APP_VERSION=${APP_VERSION} \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PORT=8080 \
    DATABASE_PATH=/data/scienceing.prod.db \
    SCIENCEING_BACKUP_DIR=/backup \
    SCIENCEING_RUNTIME_DIR=/data \
    SCIENCEING_SQLITE_JOURNAL=delete \
    SCIENCEING_STORAGE_STATE=/data/state/admin.json \
    SCIENCING_BROWSER_CHANNEL=chromium \
    SCIENCING_BROWSER_HEADLESS=true \
    WEB_DIST_DIR=/app/apps/web/dist \
    EXTENSION_DOWNLOAD_DIR=/app/apps/web/dist/downloads \
    SCIENCING_WORKER_CLI=/app/playwright/worker/dist/cli.js \
    TRUST_PROXY=1

WORKDIR /app
RUN npm install -g pnpm@11.20.0 --registry="${NPM_REGISTRY}"

# 生产依赖（不含 vite/tsc 等构建工具）；--ignore-scripts 避免安装期下载浏览器
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY apps/extension/package.json apps/extension/
COPY packages/shared ./packages/shared
COPY playwright/worker/package.json playwright/worker/

RUN pnpm config set registry "${NPM_REGISTRY}" \
    && pnpm install --prod --frozen-lockfile --ignore-scripts \
    && rm -rf /root/.cache /root/.local/share/pnpm

# apt 源替换必须在任何 apt-get 之前（playwright install --with-deps 内部会跑 apt-get）
RUN if [ -n "${APT_MIRROR}" ]; then \
      sed -i "s|http://deb.debian.org|${APT_MIRROR}|g" /etc/apt/sources.list.d/debian.sources 2>/dev/null || true; \
      sed -i "s|http://deb.debian.org|${APT_MIRROR}|g" /etc/apt/sources.list 2>/dev/null || true; \
    fi

# Chromium + 系统依赖（Worker 用 channel=chromium，不依赖系统 Chrome）
RUN if [ "${INSTALL_CHROMIUM}" = "true" ]; then \
      if [ -n "${PLAYWRIGHT_DOWNLOAD_HOST}" ]; then export PLAYWRIGHT_DOWNLOAD_HOST="${PLAYWRIGHT_DOWNLOAD_HOST}"; fi; \
      cd playwright/worker && ./node_modules/.bin/playwright install --with-deps chromium && rm -rf /var/lib/apt/lists/*; \
    else \
      echo "WARN: INSTALL_CHROMIUM=false，管理员重置科应密码功能将不可用"; \
    fi

# 编译产物：后端 dist、前端 dist（含 /downloads 扩展包）、Worker dist
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/playwright/worker/dist ./playwright/worker/dist

COPY deploy-cloudbase/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod 0755 /usr/local/bin/entrypoint.sh \
    && mkdir -p /data /backup /state /app/playwright/.worker-logs

EXPOSE 8080

# 平台侧健康检查路径同样配置为 /api/health（控制台「服务配置 → 健康检查」）
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
    CMD node -e "const p=process.env.PORT||8080;fetch('http://127.0.0.1:'+p+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "/app/apps/server/dist/main.js"]
