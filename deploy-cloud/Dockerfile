# 科应共享账号管理平台 —— 生产镜像
#
# 构建上下文 = Release 制品解压目录（由 create-release.ps1 在开发机产出）。
# 该目录已含 server/web/worker 的生产依赖，因此本镜像**不做任何安装或编译**，
# 只做拷贝 —— 这既保住了「开发机构建、生产机消费制品」的既有原则，
# 也避免在 2C2G 服务器上跑 pnpm install 把内存打满。
#
# 基础镜像选 Playwright 官方镜像：Chromium 与全部 Linux 系统依赖已就位，
# 省掉 `playwright install --with-deps` 的 apt 折腾，也避免版本漂移。
FROM mcr.microsoft.com/playwright:v1.62.1-noble

ENV NODE_ENV=production \
    TZ=Asia/Shanghai \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app

# Release 制品：apps/server、apps/web/dist、playwright/worker、release.json
COPY --chown=pwuser:pwuser . /app

# 数据卷挂载点预先建好并交给非 root 用户，避免首次启动时权限不足
RUN mkdir -p /data /backups /state \
    && chown -R pwuser:pwuser /data /backups /state

# Playwright 镜像自带的非 root 用户（uid 1000）
USER pwuser
RUN node /app/deploy-cloud/scripts/check-runtime.mjs

EXPOSE 3000

# 健康检查用的 /api/extension/config 是公开端点（无 AuthGuard），无需额外开洞
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/api/extension/config').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "/app/apps/server/dist/main.js"]
