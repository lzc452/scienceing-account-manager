// 批量创建员工账号（直接写库，绕过 admin 后台）
// 用法：在 apps/server 目录执行 `node scripts/create-users.js`
// 注意：需要 Node 22.5+（node:sqlite）；跑之前先停后端，避免 WAL 锁冲突。
'use strict';
const { DatabaseSync } = require('node:sqlite');
const { resolve } = require('node:path');
const bcrypt = require('bcryptjs');

// 数据库路径（与 server 默认一致，可用 DATABASE_PATH 覆盖）
const DB_PATH = process.env.DATABASE_PATH ?? resolve(__dirname, '..', '..', 'data', 'scienceing.db');

// ★ 改这里：要创建的员工账号（密码会经 bcrypt 哈希后入库，绝不存明文）
const EMPLOYEES = [
  { username: 'zhangsan', displayName: '张三', department: '研发部', password: 'Zhang3@123', role: 'USER' },
  { username: 'lisi',     displayName: '李四', department: '研发部', password: 'Li4@12345',  role: 'USER' },
  { username: 'wangwu',   displayName: '王五', department: '产品部', password: 'Wang5@123',  role: 'USER' },
  { username: 'zhaoliu',  displayName: '赵六', department: '产品部', password: 'Zhao6@123',  role: 'USER' },
  { username: 'sunqi',    displayName: '孙七', department: '测试部', password: 'Sun7@12345', role: 'USER' },
];

const db = new DatabaseSync(DB_PATH);
const now = new Date().toISOString();
let created = 0;

for (const u of EMPLOYEES) {
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(u.username);
  if (exists) {
    console.log(`跳过（已存在）: ${u.username}`);
    continue;
  }
  const hash = bcrypt.hashSync(u.password, 10);
  db.prepare(`
    INSERT INTO users (username, display_name, department, password_hash, role, enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)
  `).run(u.username, u.displayName, u.department, hash, u.role, now, now);
  created += 1;
  console.log(`已创建: ${u.username} / ${u.displayName}（${u.department}，角色 ${u.role}）`);
}

db.close();
console.log(`\n完成：本次新建 ${created} 个用户`);
