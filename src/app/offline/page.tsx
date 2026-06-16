export const metadata = { title: "Offline — 5S Daily" };

export default function OfflinePage() {
  return (
    <div className="phone-stage">
      <div className="phone">
        <div className="screen items-center justify-center text-center p-8 gap-2">
          <div className="text-6xl mb-2">📡</div>
          <div className="text-[22px] font-bold">Bạn đang ngoại tuyến</div>
          <p className="text-ink-muted">
            Không có kết nối mạng. Ảnh bạn chụp sẽ được lưu lại và tự động gửi khi có mạng trở lại.
          </p>
        </div>
      </div>
    </div>
  );
}
