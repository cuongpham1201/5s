"use client";

import { useCallback, useEffect, useState } from "react";
import type { GeoLocationSnapshot } from "@/types/submission";

const NO_ADDRESS = "Chưa xác định địa chỉ"; // reverse geocoding is a future step
const TIMEOUT_MS = 5000;

function isSecure(): boolean {
  if (typeof window === "undefined") return false;
  if (window.isSecureContext) return true;
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1" || h === "::1";
}

function emptySnapshot(status: GeoLocationSnapshot["status"]): GeoLocationSnapshot {
  return { latitude: null, longitude: null, accuracy: null, capturedAt: null, status, address: NO_ADDRESS };
}

/**
 * Request the current GPS position. Never rejects, never blocks submission.
 * Resolves with a snapshot whose `status` describes the outcome.
 */
export function getGeoSnapshot(): Promise<GeoLocationSnapshot> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation || !isSecure()) {
      resolve(emptySnapshot("unavailable"));
      return;
    }
    let settled = false;
    const done = (snap: GeoLocationSnapshot) => {
      if (!settled) {
        settled = true;
        resolve(snap);
      }
    };
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        done({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          capturedAt: new Date().toISOString(),
          status: "ok",
          address: NO_ADDRESS,
        }),
      (err) =>
        done(
          emptySnapshot(
            err.code === err.PERMISSION_DENIED
              ? "denied"
              : err.code === err.TIMEOUT
                ? "timeout"
                : "unavailable",
          ),
        ),
      { enableHighAccuracy: true, timeout: TIMEOUT_MS, maximumAge: 10000 },
    );
    // Hard timeout backstop (some browsers ignore the option).
    setTimeout(() => done(emptySnapshot("timeout")), TIMEOUT_MS + 500);
  });
}

interface UseGeolocation {
  snapshot: GeoLocationSnapshot;
  requesting: boolean;
  request: () => Promise<GeoLocationSnapshot>;
}

/** Auto-requests GPS on mount; exposes status + a manual re-request. */
export function useGeolocation(auto = true): UseGeolocation {
  const [snapshot, setSnapshot] = useState<GeoLocationSnapshot>(emptySnapshot("pending"));
  const [requesting, setRequesting] = useState(false);

  const request = useCallback(async () => {
    setRequesting(true);
    setSnapshot((s) => ({ ...s, status: "pending" }));
    const snap = await getGeoSnapshot();
    setSnapshot(snap);
    setRequesting(false);
    return snap;
  }, []);

  useEffect(() => {
    if (auto) void request();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  return { snapshot, requesting, request };
}
