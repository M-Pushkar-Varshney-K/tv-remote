"use client";

import { useEffect, useRef, useState } from "react";

// Optional quick buttons (you can add more later)
const REMOTE_BUTTONS = [
  { label: "TRIAL",  cmd: "TRIAL" },
  { label: "Power",  cmd: "Power" },
  { label: "Home",   cmd: "Home" },
  { label: "Live_TV",cmd: "Live_TV" },
  { label: "Back",   cmd: "Back" },
  { label: "Up",     cmd: "Up" },
  { label: "Down",   cmd: "Down" },
  { label: "Left",   cmd: "Left" },
  { label: "Right",  cmd: "Right" },
  { label: "OK",     cmd: "OK" },
  { label: "Cursor", cmd: "Cursor" },
  { label: "Vol_up", cmd: "Vol_up" },
  { label: "Vol_down",cmd: "Vol_down" },
  { label: "CH_up",  cmd: "CH_up" },
  { label: "CH_down",cmd: "CH_down" },
  { label: "Mute",   cmd: "Mute" },
  { label: "InStart",cmd: "InStart" },
  { label: "1",      cmd: "1" },
  { label: "2",      cmd: "2" },
  { label: "3",      cmd: "3" },
  { label: "4",      cmd: "4" },
  { label: "5",      cmd: "5" },
  { label: "6",      cmd: "6" },
  { label: "7",      cmd: "7" },
  { label: "8",      cmd: "8" },
  { label: "9",      cmd: "9" },
  { label: "0",      cmd: "0" },
];

export default function Remote() {
  // ---------- TV Screen ----------
  const canvasRef = useRef(null);
  const backCanvasRef = useRef(null);

  const [status, setStatus] = useState("Connecting…");
  const [cmdLog, setCmdLog] = useState([]);

  // Resize canvas to match CSS size * DPR for crisp rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const updateSize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3)); // clamp DPR if desired
      const w = Math.floor(rect.width * dpr);
      const h = Math.floor(rect.height * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        // Also resize back buffer to match
        if (backCanvasRef.current) {
          backCanvasRef.current.width = w;
          backCanvasRef.current.height = h;
        }
      }
    };

    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(canvas);
    window.addEventListener("resize", updateSize);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, []);

  // Draw a single frame (data URL -> ImageBitmap -> back -> front)
// Draw a single frame from either a blob: URL or data: URL
const drawFrameFromUrl = async (url) => {
  const front = canvasRef.current;
  if (!front) return;

  if (!backCanvasRef.current) {
    backCanvasRef.current = document.createElement("canvas");
    backCanvasRef.current.width = front.width;
    backCanvasRef.current.height = front.height;
  }
  const back = backCanvasRef.current;

  if (back.width !== front.width || back.height !== front.height) {
    back.width = front.width;
    back.height = front.height;
  }

  const ctxBack = back.getContext("2d", { alpha: false, desynchronized: true });
  const ctxFront = front.getContext("2d", { alpha: false, desynchronized: true });

  // Read bytes once (works for both blob: and data: URLs)
  const res = await fetch(url);
  const blob = await res.blob();

  const bitmap = await createImageBitmap(blob);

  const W = back.width, H = back.height;
  const scale = Math.min(W / bitmap.width, H / bitmap.height);
  const w = Math.floor(bitmap.width * scale);
  const h = Math.floor(bitmap.height * scale);
  const x = Math.floor((W - w) / 2);
  const y = Math.floor((H - h) / 2);

  ctxBack.clearRect(0, 0, W, H);
  ctxBack.drawImage(bitmap, x, y, w, h);
  ctxFront.drawImage(back, 0, 0);

  bitmap.close();
};

  // Subscribe to frames + status + command replies via Electron preload bridge
 useEffect(() => {
  const bridge = (typeof window !== "undefined") && (window.tv || window.api);
  if (!bridge) {
    setStatus("❌ No Electron bridge (window.tv/window.api missing)");
    return;
  }

  // Keep track of the last object URL to revoke it and prevent leaks
  let lastObjUrl = null;

  // Helper: draw from either a data URL or an object URL
  const drawFrame = async (frame) => {
    try {
      // Handle both shapes:
      // 1) { dataUrl }
      // 2) { type: 'objectUrl' | 'dataUrl' | 'unknown', value }
      if (!frame) return;

      // Case A: legacy shape { dataUrl }
      if (typeof frame.dataUrl === 'string') {
        await drawFrameFromUrl(frame.dataUrl);
        return;
      }

      // Case B: projected shape { type, value }
      const { type, value } = frame;

      if (type === 'dataUrl' && typeof value === 'string') {
        await drawFrameFromUrl(value);
        return;
      }

      if (type === 'objectUrl' && typeof value === 'string') {
        // Revoke previous Blob URL to avoid leaks
        if (lastObjUrl && lastObjUrl !== value) URL.revokeObjectURL(lastObjUrl);

        await drawFrameFromUrl(value); // blob: URL handled
        lastObjUrl = value;
        return;
      }

      // Unknown format; ignore silently or log if you wish
      // console.warn('Unknown frame payload:', frame);
    } catch (err) {
      // Bubble error to caller
      throw err;
    }
  };

  // Connection status (from main: { image: 'connected'|'disconnected', cmd: 'connected'|'disconnected', reason? })
  const offStatus = bridge.onStatus?.((s) => {
    const parts = [];
    if (s.image) parts.push(`Image: ${s.image}${s.reason ? ` (${s.reason})` : ""}`);
    if (s.cmd)   parts.push(`Cmd: ${s.cmd}${s.reason ? ` (${s.reason})` : ""}`);
    setStatus(parts.join(" | ") || "");
  });

  let drawing = false;
  let pending = null;

  const offFrame = bridge.onFrame?.((payload) => {
    pending = payload;
    if (drawing) return;

    drawing = true;
    (async () => {
      try {
        while (pending) {
          const next = pending;
          pending = null;
          await drawFrame(next);
        }
        setStatus((prev) => (prev?.startsWith("Frame decode error") ? "" : prev));
      } catch {
        setStatus("Frame decode error");
      } finally {
        drawing = false;
      }
    })();
  });

  // Command replies (line-based: "OK", "ERR", "PONG", "BYE", "UNKNOWN_CMD")
  const offReply = bridge.onCmdReply?.((line) => {
    setCmdLog((a) => [`⇦ ${line}`, ...a]);
  });

  return () => {
    // Unsubscribe
    offStatus && offStatus();
    offFrame && offFrame();
    offReply && offReply();

    // Revoke any last object URL
    if (lastObjUrl) {
      URL.revokeObjectURL(lastObjUrl);
      lastObjUrl = null;
    }
  };
}, []);

  // ---------- Run Remote Commands ----------
  async function run(cmd) {
    const bridge = (typeof window !== "undefined") && (window.tv || window.api);
    if (!bridge || typeof bridge.sendCmd !== "function") {
      setCmdLog((a) => ["❌ No Electron bridge or sendCmd()", ...a]);
      return;
    }
    try {
      const r = await bridge.sendCmd(cmd);
      if (!r?.ok) {
        setCmdLog((a) => [`❌ ${cmd}\n${r?.error || "unknown error"}`, ...a]);
      } else {
        setCmdLog((a) => [`▶ ${cmd}`, ...a]);
      }
    } catch (e) {
      setCmdLog((a) => [`❌ ${cmd}\n${String(e)}`, ...a]);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: "1fr 420px",
        gap: 16,
        background: "#0b1020",
        color: "#fff",
        padding: 16,
      }}
    >
      {/* LEFT SCREEN */}
      <div
        style={{
          background: "rgba(0,0,0,0.4)",
          borderRadius: 12,
          padding: 12,
          display: "grid",
          gridTemplateRows: "auto 1fr",
        }}
      >
        <h3>TV Screen</h3>

        <div style={{ position: "relative" }}>
          <canvas
            ref={canvasRef}
            style={{
              width: "100%",
              height: "70vh",
              background: "#000",
              borderRadius: 12,
              boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 12,
              bottom: 12,
              opacity: 0.9,
              fontSize: 12,
              background: "rgba(0,0,0,0.5)",
              padding: "4px 6px",
              borderRadius: 6,
            }}
          >
            {status || "Live capture running…"}
          </div>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div
        style={{
          background: "rgba(0,0,0,0.4)",
          borderRadius: 12,
          padding: 12,
          display: "grid",
          gridTemplateRows: "auto auto 1fr",
          gap: 12,
        }}
      >
        <h3>Remote</h3>

        {/* Button Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 8,
          }}
        >
          {REMOTE_BUTTONS.map((b) => (
            <button
              key={b.label}
              onClick={() => run(b.cmd)}
              style={{
                padding: "10px 8px",
                borderRadius: 10,
                border: "1px solid #333",
                background: "#1f2937",
                color: "#e5e7eb",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              {b.label}
            </button>
          ))}
        </div>

        {/* Command Log */}
        <div
          style={{
            background: "#0b1222",
            borderRadius: 10,
            padding: 8,
            whiteSpace: "pre-wrap",
            overflow: "auto",
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace",
          }}
        >
          {cmdLog.length === 0
            ? "Command output will appear here…"
            : cmdLog.map((line, i) => (
                <div key={i} style={{ marginBottom: 8 }}>
                  {line}
                </div>
              ))}
        </div>
      </div>
    </div>
  );
}