# 5S Daily — Deployment Guide

> Ubuntu Homelab → PM2 → Cloudflare. Workflow chính thức (2026-06-24).

---

## Workspaces (TÁCH BIỆT — bắt buộc)

| | Đường dẫn | Vai trò |
|---|---|---|
| **DEV** | `/data/dev/5s-app` | Nơi code/build/test/commit/push. **Chỉ sửa code ở đây.** |
| **PRODUCT/STAGING** | `/data/homelab/apps/5s-app/5s` | Runtime. **Chỉ nhận code qua `git pull`.** PM2 chạy từ đây. |

- **KHÔNG** sửa code trực tiếp trong product folder (chỉ `git pull`; ngoại lệ `.env.local` khi được yêu cầu rõ).
- Cloudflare `she.biahalong.com` → product PM2 **port 3002**.

## Deploy flow (7 bước)

```
1. (dev)     code + build + test         /data/dev/5s-app
2. (dev)     git commit
3. (dev)     git push  → GitHub
4. (product) git pull                     /data/homelab/apps/5s-app/5s
5. (product) npm install
6. (product) npm run build
7. (product) pm2 restart 5s-app --update-env
```

Trước task deploy: verify `pwd` = `/data/homelab/apps/5s-app/5s`, chỉ `git pull`, không sửa file thủ công.

## Topology

```
Internet → Cloudflare (she.biahalong.com) → PM2 (product, :3002) → Microsoft 365 / Graph
```

## Prerequisites (trên host staging)

- Node 20.x (khớp `node -v` của dev: v20.20.2)
- PM2 cài global: `npm i -g pm2`
- `cloudflared` đã cài + đã `cloudflared tunnel login`
- `.env.local` chứa secret thật (xem `docs/ENVIRONMENT_SETUP.md`) — KHÔNG commit

## Build & run (staging)

```bash
git pull
npm ci
npm run build
pm2 start ecosystem.config.js --env production
pm2 save
pm2 logs 5s-daily
```

## Cloudflare Tunnel

```bash
# Ánh xạ hostname staging → localhost:3000
cloudflared tunnel route dns <tunnel-name> 5s-staging.<domain>
# ingress: 5s-staging.<domain> -> http://localhost:3000
cloudflared tunnel run <tunnel-name>
```

Sau khi có domain staging:
- Cập nhật `NEXTAUTH_URL=https://5s-staging.<domain>`.
- Thêm Redirect URI vào App Registration:
  `https://5s-staging.<domain>/api/auth/callback/microsoft-entra-id`.

## Rollback

```bash
git checkout <previous-commit>
npm ci && npm run build
pm2 reload 5s-daily
```

## Lưu ý bảo mật

- `trustHost: true` đã bật (app chạy sau reverse proxy) — bắt buộc cho Auth.js v5.
- Đặt `NEXT_PUBLIC_ALLOW_DEV_LOGIN=false` ở staging/production để tắt dev mock login.
- Access token Graph chỉ ở JWT mã hóa (httpOnly cookie), không expose ra client.
- KHÔNG dùng tài khoản/secret production cho staging; KHÔNG restart PM2 production.
