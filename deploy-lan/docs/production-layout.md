# 生产机标准目录与部署教程

生产机只需要一个固定目录（默认 `D:\scienceing-prod`，可用 `-InstallRoot` 覆盖）+ 能访问开发机共享 `\\<开发机IP>\git-local-share`。脚本运行位置不限：源码工作区、Release 解压目录都可以（非 git 工作区会自动进入纯 SMB 部署模式）。

## 1. 标准目录结构

```text
D:\scienceing-prod\                      # InstallRoot：配置 + 数据，长期稳定
├─ .env                                  # ★ 你手工放：从旧项目根复制，必须含原 SCIENCEING_MASTER_KEY
├─ config.env                            # 可选；缺失时脚本自动从 Release 补
├─ legacy\                               # ★ 首次部署放一次旧库（之后不再动）
│  └─ scienceing.db (+ .db-wal .db-shm)
├─ data\
│  └─ scienceing.prod.db                 # 脚本自动创建的唯一生产主库（勿手工放/改名）
├─ backups\                              # 每次发布前的自动快照
├─ run\                                  # PID、部署日志 deploy-<Tag>-<时间戳>.log
├─ packages\                             # 从共享目录下载的 zip + sha256
├─ releases\v1.0.2\                      # 每个版本的代码（脚本自动解压）
│  └─ apps\ deploy-lan\ release.json …
└─ current.json                          # 当前运行版本指针
```

## 2. 首次部署（从旧手工部署切换）

① 旧服务先停止；② 创建目录并放入 `.env` 与旧库：

```powershell
mkdir D:\scienceing-prod\legacy
copy <旧项目根>\.env                        D:\scienceing-prod\.env
copy <旧项目>\data\scienceing.db            D:\scienceing-prod\legacy\
copy <旧项目>\data\scienceing.db-wal        D:\scienceing-prod\legacy\    # 存在才需要
copy <旧项目>\data\scienceing.db-shm        D:\scienceing-prod\legacy\    # 存在才需要
```

③ 执行部署（两种运行位置任选）：

```powershell
# 方式 A：生产机源码工作区（先同步最新脚本）
cd <生产机源码目录>
.\sync-from-dev.ps1
git pull --ff-only lan main
.\deploy-prod.bat

# 方式 B：Release 解压目录（不碰源码）
cd D:\scienceing-releases\releases\scienceing-v1.0.2
.\deploy-prod.bat
```

脚本自动完成：解析最新 Tag → 从共享目录取 zip + SHA256 校验 → 自动发现 `legacy\scienceing.db` 并用 `VACUUM INTO` 导出一致性快照到 `data\scienceing.prod.db` → 自动停掉仍占用 3000/18080 的旧实例 → 备份 → `db:migrate` + `db:doctor`（补齐 v4~v7 全部表/列）→ `db:verify` → 打包 LAN 扩展 → 启动 + 健康检查 → 打印状态。

旧库原文件一个字节不会被改写，可随时回退。

## 3. 之后的每次升级

开发机：

```powershell
git add -A && git commit -m "..."
.\make-release.ps1            # 自动 Tag + 打包到 E:\git-local-share\releases
```

生产机：

```powershell
.\deploy-prod.bat             # 自动部署共享目录里的最新 Release
```

就这两条命令。部署失败会自动恢复发布前快照并重启上一版本；成功版本记录在 `current.json`。

## 4. 常用运维命令（在 InstallRoot 的 releases\<Tag> 或源码工作区执行）

```powershell
.\deploy-release.ps1 -Tag vX.Y.Z          # 部署指定版本
node deploy-lan\scripts\deploy.mjs status # 查看运行状态
node deploy-lan\scripts\deploy.mjs db:backup        # 手动备份
node deploy-lan\scripts\deploy.mjs db:restore --source <快照> --target data\scienceing.prod.db
node deploy-lan\scripts\db-doctor.mjs [--fix]       # 库结构体检/自愈
node deploy-lan\scripts\db-doctor.mjs --fix --set-must-change all   # 让所有用户下次登录强制改密
```

## 5. 注意事项

- `.env` 里的 `SCIENCEING_MASTER_KEY` 换值 = 旧密文全部解不开，脚本会在 `db:verify` 失败终止（保护行为）。
- 正式 Release 包不可覆盖：重发同一版本需先删 Tag 和 `E:\git-local-share\releases\scienceing-vX.Y.Z.zip*`。
- 部署全程日志：`D:\scienceing-prod\run\deploy-<Tag>-<时间戳>.log`。
- 扩展下载地址随 `config.env` 的 LAN_IP 变化，IP 变了重跑一次部署（脚本会重新 `extension:pack`）。
