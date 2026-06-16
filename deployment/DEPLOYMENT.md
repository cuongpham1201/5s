# 5S Daily — Deployment (Staging) Guide

> Ubuntu Homelab → PM2 → Cloudflare Tunnel. **Tài liệu chuẩn bị — KHÔNG deploy ở Phase 1B.**
> Không có production thật được đụng tới trong phiên làm việc này.

---

## Topology

```
Internet → Cloudflare Tunnel (TLS, no open ports) → Next.js (PM2, :3000) → Microsoft 365 / Graph
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
