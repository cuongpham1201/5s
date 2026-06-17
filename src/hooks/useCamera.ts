"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type Facing = "environment" | "user";
export type CameraErrorKind = "insecure" | "unsupported" | "denied" | "no-device" | "other";

interface UseCameraResult {
  videoRef: React.RefObject<HTMLVideoElement>;
  facing: Facing;
  ready: boolean;
  errorKind: CameraErrorKind | null;
  errorMessage: string | null;
  start: () => Promise<void>;
  stop: () => void;
  flip: () => void;
  /** Capture the current video frame as a JPEG data URL, or null if not ready. */
  capture: () => string | null;
}

const HTTPS_HINT =
  "Camera cần HTTPS hoặc localhost. Hãy mở app qua https://she.biahalong.com để chụp ảnh.";

function isSecure(): boolean {
  if (typeof window === "undefined") return false;
  // Secure context = https OR localhost/127.0.0.1 (per browser spec).
  if (window.isSecureContext) return true;
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1" || h === "::1";
}

/**
 * Camera access (Phase 1C) with explicit secure-context handling.
 * Distinguishes: insecure context (HTTP IP/Tailscale) vs unsupported browser vs
 * permission denied vs no device. getUserMedia requires HTTPS or localhost.
 */
export function useCamera(): UseCameraResult {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<Facing>("environment");
  const [ready, setReady] = useState(false);
  const [errorKind, setErrorKind] = useState<CameraErrorKind | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fail = (kind: CameraErrorKind, message: string) => {
    setErrorKind(kind);
    setErrorMessage(message);
    setReady(false);
  };

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setReady(false);
  }, []);

  const start = useCallback(async () => {
    setErrorKind(null);
    setErrorMessage(null);

    // 1) Insecure context (HTTP over IP/Tailscale) — most common on real phones.
    if (!isSecure()) {
      fail("insecure", HTTPS_HINT);
      return;
    }
    // 2) API truly unavailable in this browser.
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      fail("unsupported", "Trình duyệt không hỗ trợ camera.");
      return;
    }
    try {
      stop();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setReady(true);
    } catch (e) {
      const name = (e as Error)?.name;
      // 3) Permission denied. 4) No device. Else other.
      if (name === "NotAllowedError" || name === "SecurityError")
        fail("denied", "Bạn đã từ chối quyền camera. Hãy bật lại quyền camera trong cài đặt trình duyệt.");
      else if (name === "NotFoundError" || name === "OverconstrainedError")
        fail("no-device", "Không tìm thấy camera trên thiết bị.");
      else fail("other", "Không mở được camera: " + ((e as Error)?.message ?? "lỗi không xác định"));
    }
  }, [facing, stop]);

  const flip = useCallback(() => {
    setFacing((f) => (f === "environment" ? "user" : "environment"));
  }, []);

  const capture = useCallback((): string | null => {
    const video = videoRef.current;
    if (!ready || !video || !video.videoWidth) return null;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    try {
      return canvas.toDataURL("image/jpeg", 0.7);
    } catch {
      return null;
    }
  }, [ready]);

  useEffect(() => {
    if (streamRef.current) void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing]);

  useEffect(() => () => stop(), [stop]);

  return { videoRef, facing, ready, errorKind, errorMessage, start, stop, flip, capture };
}

/**
 * Build a simulated photo data URL (used when real capture isn't possible, e.g.
 * insecure context or no camera) so the multi-photo flow stays testable.
 */
export function makeSimulatedPhoto(seq: number, label: string): string {
  if (typeof document === "undefined") return "";
  const canvas = document.createElement("canvas");
  canvas.width = 600;
  canvas.height = 800;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const hue = (seq * 47 + 200) % 360;
  const grad = ctx.createLinearGradient(0, 0, 600, 800);
  grad.addColorStop(0, `hsl(${hue} 32% 78%)`);
  grad.addColorStop(1, `hsl(${hue} 28% 48%)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 600, 800);
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.font = "bold 200px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("5S", 300, 440);
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = "bold 28px sans-serif";
  ctx.fillText(`Ảnh mô phỏng #${seq}`, 300, 540);
  ctx.font = "22px sans-serif";
  ctx.fillText(label, 300, 580);
  try {
    return canvas.toDataURL("image/jpeg", 0.7);
  } catch {
    return "";
  }
}
