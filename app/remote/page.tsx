"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api"; // ✅ Tauri API

// ---------- Types ----------
type FramePayload = string; // object URL string
type StatusPayload = string;
type CmdReply = string;

// ---------- Buttons ----------
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

// ---------- Component ----------
export default function Remote() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const backCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [status, setStatus] = useState<string>("Connecting…");
  const [cmdLog, setCmdLog] = useState<string[]>([]);

  // ---------- Canvas Resize ----------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const updateSize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 3);

      const w = Math.floor(rect.width * dpr);
      const h = Math.floor(rect.height * dpr);

      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;

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

  // ---------- Draw Frame ----------
  const drawFrame = async (url: string) => {
    const front = canvasRef.current;
    if (!front) return;

    if (!backCanvasRef.current) {
      backCanvasRef.current = document.createElement("canvas");
    }

    const back = backCanvasRef.current;

    back.width = front.width;
    back.height = front.height;

    const ctxBack = back.getContext("2d")!;
    const ctxFront = front.getContext("2d")!;

    const res = await fetch(url);
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);

    const W = back.width;
    const H = back.height;

    const scale = Math.min(W / bitmap.width, H / bitmap.height);
    const w = bitmap.width * scale;
    const h = bitmap.height * scale;

    const x = (W - w) / 2;
    const y = (H - h) / 2;

    ctxBack.clearRect(0, 0, W, H);
    ctxBack.drawImage(bitmap, x, y, w, h);
    ctxFront.drawImage(back, 0, 0);

    bitmap.close();
  };

  // ---------- Tauri Events ----------
  useEffect(() => {
    let unlistenFrame: (() => void) | undefined;
    let unlistenStatus: (() => void) | undefined;
    let unlistenCmd: (() => void) | undefined;

    let lastUrl: string | null = null;

    const init = async () => {
      // Frame stream
      unlistenFrame = await api.onFrame(async (url: FramePayload) => {
        try {
          await drawFrame(url);

          if (lastUrl && lastUrl !== url) {
            URL.revokeObjectURL(lastUrl);
          }

          lastUrl = url;
        } catch {
          setStatus("Frame decode error");
        }
      });

      // Status
      unlistenStatus = await api.onStatus((s: StatusPayload) => {
        setStatus(s);
      });

      // Command reply
      unlistenCmd = await api.onCmdReply((line: CmdReply) => {
        setCmdLog((prev) => [`⇦ ${line}`, ...prev]);
      });
    };

    init();

    return () => {
      unlistenFrame && unlistenFrame();
      unlistenStatus && unlistenStatus();
      unlistenCmd && unlistenCmd();

      if (lastUrl) {
        URL.revokeObjectURL(lastUrl);
      }
    };
  }, []);

  // ---------- Send Command ----------
  const run = async (cmd: string) => {
    try {
      await api.sendCmd(cmd);
      setCmdLog((prev) => [`▶ ${cmd}`, ...prev]);
    } catch (e) {
      setCmdLog((prev) => [`❌ ${cmd} - ${String(e)}`, ...prev]);
    }
  };

  // ---------- UI ----------
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: "1fr 400px",
        gap: 16,
        background: "#0b1020",
        color: "#fff",
        padding: 16,
      }}
    >
      {/* SCREEN */}
      <div>
        <h3>TV Screen</h3>
        <canvas
          ref={canvasRef}
          style={{
            width: "100%",
            height: "70vh",
            background: "#000",
            borderRadius: 12,
          }}
        />
        <div style={{ marginTop: 8, fontSize: 12 }}>{status}</div>
      </div>

      {/* REMOTE */}
      <div>
        <h3>Remote</h3>

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
                padding: 10,
                borderRadius: 8,
                background: "#1f2937",
                color: "#fff",
                border: "none",
              }}
            >
              {b.label}
            </button>
          ))}
        </div>

        <div
          style={{
            marginTop: 16,
            background: "#111",
            padding: 10,
            borderRadius: 8,
            height: 200,
            overflow: "auto",
          }}
        >
          {cmdLog.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      </div>
    </div>
  );
}