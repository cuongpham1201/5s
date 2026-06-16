# 5S Daily — Staging Readiness Checklist

> Tick trước khi bật staging thật. Phase 1B mới chỉ chuẩn bị (foundation).

## Code & quality
- [x] `npx tsc --noEmit` PASS
- [x] `npm run lint` PASS
- [x] `npm run build` PASS
- [x] Smoke test routes (signin / api/me / providers) OK (dev mock)

## Auth (Microsoft 365)
- [ ] App Registration tạo trong tenant
- [ ] Redirect URI staging đã thêm: `/api/auth/callback/microsoft-entra-id`
- [ ] Delegated scope `User.Read` (openid/profile/email/offline_access) đã cấp
- [ ] Xác nhận `User.Read` **không cần admin consent** (nếu cần → xin admin trước)
- [ ] `AUTH_AZURE_AD_CLIENT_ID/SECRET/TENANT_ID` điền vào `.env.local` host
- [ ] `AUTH_SECRET` sinh mới (`npx auth secret`)
- [ ] `NEXTAUTH_URL` = domain staging (https)
- [ ] `NEXT_PUBLIC_ALLOW_DEV_LOGIN=false`
- [ ] Đăng nhập M365 thật thành công, `/api/me` trả profile thật
- [ ] Department mapping khớp dữ liệu tenant thật (cập nhật `department-mapping.ts` nếu cần)

## Hạ tầng
- [ ] Node 20.x trên host
- [ ] PM2 cài + `pm2 start ecosystem.config.js` chạy ổn
- [ ] `pm2 save` + startup script (`pm2 startup`)
- [ ] Cloudflare Tunnel route tới `localhost:3000`, HTTPS OK
- [ ] Healthcheck `/signin` trả 200 qua domain staging

## Bảo mật
- [ ] `.env.local` KHÔNG nằm trong git (đã gitignore)
- [ ] Dev mock login đã tắt
- [ ] Không dùng secret/tenant production cho staging

## PWA
- [ ] Service worker đăng ký (production build)
- [ ] Manifest + icons tải được qua domain staging
- [ ] (Tùy chọn) Lighthouse PWA ≥ tiêu chí cơ bản — thay icon SVG → PNG 192/512 nếu cần

> Mục có `[ ]` cần môi trường/secret thật → **ngoài phạm vi Phase 1B** (STOP nếu yêu cầu thực hiện).
