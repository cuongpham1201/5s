"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type Facing = "environment" | "user";

interface UseCameraResult {
  videoRef: React.RefObject<HTMLVideoElement>;
  facing: Facing;
  ready: boolean;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
  flip: () => void;
}

/**
 * Phase 1A camera access via navigator.mediaDevices.getUserMedia().
 * Goal: confirm camera opens and front/back switching works on mobile browsers.
 * No capture, no upload, no watermark here.
 */
export function useCamera(): UseCameraResult {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<Facing>("environment");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setReady(false);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Trình duyệt không hỗ trợ camera (cần HTTPS hoặc localhost).");
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
      if (name === "NotAllowedError") setError("Bạn đã từ chối quyền camera. Hãy bật lại trong cài đặt trình duyệt.");
      else if (name === "NotFoundError") setError("Không tìm thấy camera trên thiết bị.");
      else setError("Không mở được camera: " + (e as Error)?.message);
      setReady(false);
    }
  }, [facing, stop]);

  const flip = useCallback(() => {
    setFacing((f) => (f === "environment" ? "user" : "environment"));
  }, []);

  // Restart stream when facing changes (after first start).
  useEffect(() => {
    if (streamRef.current) void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing]);

  // Cleanup on unmount.
  useEffect(() => () => stop(), [stop]);

  return { videoRef, facing, ready, error, start, stop, flip };
}
