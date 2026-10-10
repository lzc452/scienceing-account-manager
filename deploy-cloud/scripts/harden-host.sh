#!/usr/bin/env bash
# 科应共享账号管理平台 —— 服务器加固（Ubuntu 22.04 / Debian 12）
#
# 幂等：可重复执行。所有「可能导致锁死」的操作都先验证前置条件，
# 不满足就直接中止并说明原因，绝不盲目改 sshd 配置。
#
# 用法：
#   sudo bash harden-host.sh --ssh-port 22022 --admin-ip 1.2.3.4
#   sudo bash harden-host.sh --skip-ssh      # 只做 ufw / swap / docker / 补丁
#
# 参数：
#   --ssh-port N     SSH 端口（默认沿用现有配置，不修改）
#   --admin-ip IP    限制 SSH 来源 IP（可选，强烈建议；不填则对全网放行）
#   --skip-ssh       跳过 SSH 加固
set -euo pipefail

SSH_PORT=""
ADMIN_IP=""
SKIP_SSH=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ssh-port) SSH_PORT="$2"; shift 2 ;;
    --admin-ip) ADMIN_IP="$2"; shift 2 ;;
    --skip-ssh) SKIP_SSH=1; shift ;;
    *) echo "未知参数：$1"; exit 1 ;;
  esac
done

log() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[33m[警告] %s\033[0m\n' "$*"; }
die() { printf '\033[31m[中止] %s\033[0m\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "请用 root 或 sudo 执行"

# ══════════════════════════════════════════════════════════════
# 1. SSH 加固
# ══════════════════════════════════════════════════════════════
if [[ $SKIP_SSH -eq 0 ]]; then
  log "SSH 加固"

  # 关键前置检查：没有任何公钥就直接关密码登录 = 把自己锁在门外。
  KEY_COUNT=0
  for f in /root/.ssh/authorized_keys /home/*/.ssh/authorized_keys; do
    [[ -f "$f" ]] && KEY_COUNT=$((KEY_COUNT + $(grep -cE '^(ssh-|ecdsa-)' "$f" || true)))
  done
  if [[ $KEY_COUNT -eq 0 ]]; then
    die "未检测到任何 SSH 公钥。请先上传公钥（ssh-copy-id）再执行本脚本，否则关闭密码登录后将无法登录。"
  fi
  echo "已检测到 $KEY_COUNT 个 SSH 公钥。"

  SSHD_DROPIN=/etc/ssh/sshd_config.d/99-scienceing-hardening.conf
  mkdir -p /etc/ssh/sshd_config.d
  {
    echo "# 由 deploy-cloud/scripts/harden-host.sh 生成"
    echo "PermitRootLogin prohibit-password"
    echo "PasswordAuthentication no"
    echo "KbdInteractiveAuthentication no"
    echo "ChallengeResponseAuthentication no"
    echo "PubkeyAuthentication yes"
    echo "PermitEmptyPasswords no"
    echo "X11Forwarding no"
    echo "AllowAgentForwarding no"
    echo "MaxAuthTries 3"
    echo "LoginGraceTime 30"
    [[ -n "$SSH_PORT" ]] && echo "Port $SSH_PORT"
  } > "$SSHD_DROPIN"

  if sshd -t; then
    echo "sshd 配置语法校验通过：$SSHD_DROPIN"
  else
    rm -f "$SSHD_DROPIN"
    die "sshd 配置校验失败，已回滚，未重启服务。"
  fi

  # 先 reload 再提示，避免旧会话被中断
  systemctl reload ssh 2>/dev/null || systemctl reload sshd
  echo "sshd 已重载。"
  [[ -n "$SSH_PORT" ]] && warn "SSH 端口已改为 $SSH_PORT，请立刻用新端口验证登录，确认后再关闭当前会话。"

  # fail2ban
  log "安装并配置 fail2ban"
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq fail2ban >/dev/null
  cat > /etc/fail2ban/jail.d/scienceing.local <<EOF
[sshd]
enabled = true
port    = ${SSH_PORT:-ssh}
maxretry = 4
findtime = 10m
bantime  = 1h
EOF
  systemctl enable --now fail2ban >/dev/null 2>&1 || true
  systemctl restart fail2ban
  echo "fail2ban 已启动。"
else
  log "按参数要求跳过 SSH 加固"
fi

# ══════════════════════════════════════════════════════════════
# 2. 主机防火墙（与腾讯云控制台防火墙形成双层）
# ══════════════════════════════════════════════════════════════
log "配置 ufw"
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ufw >/dev/null

# 先放行 SSH 再启用，顺序反了会断连
if [[ -n "$ADMIN_IP" ]]; then
  ufw allow from "$ADMIN_IP" to any port "${SSH_PORT:-22}" proto tcp comment 'ssh admin only'
else
  ufw allow "${SSH_PORT:-22}"/tcp comment 'ssh'
fi
ufw allow 80/tcp  comment 'http (acme + redirect)'
ufw allow 443/tcp comment 'https'
ufw default deny incoming
ufw default allow outgoing
ufw --force enable
ufw status verbose

warn "别忘了在【腾讯云控制台 → 防火墙】同步收口：只保留 22/80/443，显式删除 3389 与 3000。"
warn "控制台防火墙在主机之外，ufw 管不到它。"

# ══════════════════════════════════════════════════════════════
# 3. swap（2 GB，给 Chromium 峰值兜底）
# ══════════════════════════════════════════════════════════════
log "配置 2 GB swap"
if swapon --show | grep -q '/swapfile'; then
  echo "已存在 /swapfile，跳过。"
else
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  # 服务器用途偏吞吐，降低换出倾向
  sysctl -w vm.swappiness=10 >/dev/null
  grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf
  echo "swap 已启用。"
fi
free -h

# ══════════════════════════════════════════════════════════════
# 4. Docker 日志轮转（默认 json-file 无上限，50 GB 盘会被吃光）
# ══════════════════════════════════════════════════════════════
log "配置 Docker 日志轮转"
mkdir -p /etc/docker
if [[ -f /etc/docker/daemon.json ]]; then
  cp /etc/docker/daemon.json "/etc/docker/daemon.json.bak.$(date +%s)"
  warn "已备份原有 /etc/docker/daemon.json，请人工确认合并结果。"
  python3 - <<'PY'
import json, pathlib
p = pathlib.Path('/etc/docker/daemon.json')
cfg = json.loads(p.read_text() or '{}')
cfg.setdefault('log-driver', 'json-file')
cfg.setdefault('log-opts', {}).update({'max-size': '10m', 'max-file': '3'})
p.write_text(json.dumps(cfg, indent=2) + '\n')
PY
else
  cat > /etc/docker/daemon.json <<'JSON'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" },
  "live-restore": true
}
JSON
fi
systemctl restart docker
echo "Docker 已重启，日志上限 10m x 3。"

# ══════════════════════════════════════════════════════════════
# 5. 自动安全更新
# ══════════════════════════════════════════════════════════════
log "启用无人值守安全更新"
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq unattended-upgrades >/dev/null
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
systemctl enable --now unattended-upgrades >/dev/null 2>&1 || true
echo "已启用。"

log "加固完成"
cat <<'TIPS'

后续人工确认项：
  1. 用新配置另开一个终端验证 SSH 仍可登录，再关闭当前会话。
  2. 腾讯云控制台防火墙已收口（删除 3389 / 3000）。
  3. /opt/scienceing/.env 权限为 600 且属主正确：
       chown root:root /opt/scienceing/.env && chmod 600 /opt/scienceing/.env
  4. SCIENCEING_MASTER_KEY 已离线备份到密码管理器。
TIPS
