"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { listen } from "@tauri-apps/api/event";
import RemoteUI from "@/app/comp/Remote";
import { api } from "@/lib/api";

// ---------------- TYPES ----------------
type FramePayload = string;
type StatusPayload = string;

// ---------------- CONNECTION STATES ----------------
type ConnState =
  | "connected"
  | "server_disconnected"
  | "auto_reconnecting"
  | "manual_reconnect";

// ---------------- COMPONENT ----------------
export default function Remote() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const backCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const router = useRouter();

  // ---------- STATE ----------
  const [connState, setConnState] = useState<ConnState>("connected");
  const [statusText, setStatusText] = useState("Connected");
  const [errorMsg, setErrorMsg] = useState("");
  const [showReconnectBtn, setShowReconnectBtn] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);

  // ---------- STORED PARAMS ----------
  const storedIp = useRef("");
  const storedResolution = useRef("");
  const storedRdtMode = useRef("");

  // ---------- AUTO RECONNECT GUARD ----------
  const autoReconnectDone = useRef(false);

  // ================= CANVAS RESIZE =================
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    window.addEventListener("resize", resize);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, []);

  // ================= DRAW FRAME =================
  const drawFrame = async (url: string) => {
    try {
      const front = canvasRef.current;
      if (!front) return;

      if (!backCanvasRef.current) {
        backCanvasRef.current = document.createElement("canvas");
      }

      const back = backCanvasRef.current;
      back.width = front.width;
      back.height = front.height;

      const res = await fetch(url);
      const blob = await res.blob();
      const bitmap = await createImageBitmap(blob);

      const scale = Math.min(
        back.width / bitmap.width,
        back.height / bitmap.height
      );

      const w = bitmap.width * scale;
      const h = bitmap.height * scale;
      const x = (back.width - w) / 2;
      const y = (back.height - h) / 2;

      back.getContext("2d")!.clearRect(0, 0, back.width, back.height);
      back.getContext("2d")!.drawImage(bitmap, x, y, w, h);
      front.getContext("2d")!.drawImage(back, 0, 0);

      bitmap.close();
    } catch (e: any) {
      alert("Frame rendering error: " + e.message);
    }
  };

  // ================= WAIT FOR CONNECTION =================
  const waitForConnected = async (timeoutMs = 5000) => {
    let unlisten: (() => void) | undefined;

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        unlisten?.();
        reject(new Error("Connection timeout"));
      }, timeoutMs);

      const handleStatus = (e: { payload: StatusPayload }) => {
        if (e.payload.includes("connected")) {
          clearTimeout(timer);
          unlisten?.();
          resolve();
        }
      };

      listen<StatusPayload>("conn-status", handleStatus)
        .then((fn) => {
          unlisten = fn;
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  };

  // ================= RECONNECT =================
  const doReconnect = async () => {
    if (!storedIp.current || isReconnecting) return;

    try {
      setIsReconnecting(true);
      const reconnectWait = waitForConnected();
      await Promise.resolve();
      await api.connect(storedIp.current);
      await reconnectWait;

      if (storedResolution.current && storedRdtMode.current) {
        await api.sendCmd(
          `sz ${storedResolution.current} ${storedRdtMode.current}`
        );
      }

      setConnState("connected");
      setErrorMsg("");
      setShowReconnectBtn(false);
      autoReconnectDone.current = false;
    } catch (e: any) {
      alert("Reconnect failed: " + e.message);
      setShowReconnectBtn(true);
      setConnState("manual_reconnect");
    } finally {
      setIsReconnecting(false);
    }
  };

  // ================= DISCONNECT =================
  const handleDisconnect = async () => {
    try {
      await api.disconnect();
    } finally {
      router.push("/");
    }
  };

  // ================= TAURI EVENTS =================
  useEffect(() => {
    let lastUrl: string | null = null;
    let unFrame: any;
    let unStatus: any;

    (async () => {
      unFrame = await api.onFrame(async (url: FramePayload) => {
        await drawFrame(url);
        if (lastUrl && lastUrl !== url) URL.revokeObjectURL(lastUrl);
        lastUrl = url;
      });

      unStatus = await api.onStatus((s: StatusPayload) => {
        setStatusText(s);

        // -------- SERVER DISCONNECTED --------
        if (s.includes("disconnected") || s.includes("failed")) {
          setErrorMsg("Server disconnected");

          if (!autoReconnectDone.current) {
            autoReconnectDone.current = true;
            setConnState("auto_reconnecting");
            doReconnect();
          } else {
            setShowReconnectBtn(true);
            setConnState("manual_reconnect");
          }
        }

        // -------- CONNECTED --------
        if (s.includes("connected")) {
          setConnState("connected");
          setErrorMsg("");
          setShowReconnectBtn(false);
          autoReconnectDone.current = false;
        }
      });
    })();

    return () => {
      unFrame && unFrame();
      unStatus && unStatus();
      if (lastUrl) URL.revokeObjectURL(lastUrl);
    };
  }, []);

  // ================= READ URL PARAMS =================
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    storedIp.current = params.get("ip") || "";
    storedResolution.current = params.get("resolution") || "";
    storedRdtMode.current = params.get("rdtMode") || "";
  }, []);

  // ================= UI =================
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: "1fr 400px",
        gap: 16,
        padding: 16,
        background: "#0b1020",
        color: "#fff",
      }}
    >
      <div>
        {/* ERROR MESSAGE */}
        {errorMsg && (
          <div
            style={{
              background: "#7f1d1d",
              padding: 12,
              borderRadius: 6,
              marginBottom: 12,
            }}
          >
            ⚠️ {errorMsg}
          </div>
        )}

        {/* CONTROLS */}
        <div className="flex gap-4 items-center mb-4">
          {!showReconnectBtn && (
            <button
              onClick={handleDisconnect}
              className="px-6 py-2 bg-gray-700 rounded"
            >
              ← Home
            </button>
          )}

          {showReconnectBtn && (
            <button
              onClick={doReconnect}
              disabled={isReconnecting}
              className="px-6 py-2 bg-blue-600 rounded"
            >
              {isReconnecting ? "Reconnecting..." : "↻ Reconnect"}
            </button>
          )}

          <h3 className="text-xl font-bold text-gray-300">TV Screen</h3>
        </div>

        {/* CANVAS */}
        <canvas
          ref={canvasRef}
          style={{
            width: "100%",
            height: "70vh",
            background: "#000",
            borderRadius: 12,
          }}
        />

        <div style={{ fontSize: 12, marginTop: 8 }}>{statusText}</div>
      </div>

      <RemoteUI />
    </div>
  );
}