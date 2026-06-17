# 5S Daily — Watermark Engine (Phase 2A)

> Client-side Canvas watermark. `src/lib/watermark/`. Chạy trên trình duyệt (cần `document`/canvas).

## API

```ts
generateWatermarkedImage(input: WatermarkInput): Promise<WatermarkResult>
```

**Input**
```ts
WatermarkInput {
  source: string;            // data URL ảnh gốc (camera capture hoặc mô phỏng)
  metadata: WatermarkMetadata;
  options?: { maxDimension?: number; jpegQuality?: number };  // default 1280 / 0.72
}
```

**Output**
```ts
WatermarkResult {
  originalDataUrl: string;     // ảnh gốc đã re-encode (downscale, không watermark)
  watermarkedDataUrl: string;  // ảnh có watermark
  width, height: number;
  mimeType: "image/jpeg";
  sizeBytes: number;           // ước lượng dung lượng watermarked
}
```

## Nội dung watermark (đúng yêu cầu nghiệp vụ)

```
HH:mm | dd/MM/yyyy
Thứ …
<địa chỉ>
Phòng ban: PMKT
Khu vực: Văn phòng
Người chụp: Nguyễn Văn A
GPS: 20.9512, 107.0834
✓ 5S Verified
```

Build từ `buildWatermarkMetadata(session, geoSnapshot, when)` (`src/lib/submissions/metadata.ts`).

## Quy tắc render

- Canvas-based, khối watermark ở **góc dưới-trái**.
- Nền **đen bán trong suốt** (`rgba(0,0,0,0.55)`), bo góc; chữ **trắng**, dòng cuối "5S Verified" **xanh**.
- **Font scale theo chiều cao ảnh** (`~2.4% × h`, kẹp 13–34px) để đọc tốt trên mobile.
- **Giữ tỷ lệ** ảnh; downscale cạnh dài về `maxDimension` (mặc định 1280), không upscale.
- JPEG quality cấu hình (`jpegQuality`, mặc định 0.72).

## Lưu ý / tương lai

- GPS hiện lấy từ `useGeolocation`; **reverse geocoding** (địa chỉ thật) là bước sau — hiện fallback "Chưa xác định địa chỉ".
- Watermark **client-side** cho MVP (offline, WYSIWYG). Phase sau có thể thêm **server re-stamp + chữ ký số** chống giả (xem RISKS_AND_DECISIONS.md anti-fraud).
- `originalDataUrl` giữ làm bằng chứng + để upload bản gốc (Phase 2C).
