"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import RemoteUI from "@/app/comp/Remote";
import Shell from "@/app/comp/Shell";
import { api } from "@/lib/api";

const isTauri = typeof window !== "undefined" && "__TAURI__" in window;

const clampRemoteWidth = (width: number, viewportWidth: number) => {
  const maxWidth = Math.min(520, viewportWidth * 0.55);
  return Math.round(Math.max(Math.min(180, maxWidth), Math.min(maxWidth, width)));
};

export default function RemotePage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const splitPaneRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  const [showReconnectBtn, setShowReconnectBtn] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [showRemote, setShowRemote] = useState(true);
  const [showShell, setShowShell] = useState(true);
  const [remoteWidth, setRemoteWidth] = useState(320);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    const savedWidth = Number(localStorage.getItem("remoteWidth"));
    if (Number.isFinite(savedWidth) && savedWidth > 0) {
      setRemoteWidth(clampRemoteWidth(savedWidth, window.innerWidth));
    }
  }, []);

  const resizeRemote = useCallback((width: number) => {
    const nextWidth = clampRemoteWidth(width, window.innerWidth);
    setRemoteWidth(nextWidth);
    localStorage.setItem("remoteWidth", String(nextWidth));
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handlePointerMove = (event: PointerEvent) => {
      const pane = splitPaneRef.current;
      if (!pane) return;
      const paddingRight = Number.parseFloat(
        window.getComputedStyle(pane).paddingRight
      );
      resizeRemote(
        pane.getBoundingClientRect().right -
          paddingRight -
          event.clientX -
          12
      );
    };
    const handlePointerUp = () => setIsResizing(false);

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [isResizing, resizeRemote]);

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

    return () => {
      ro.disconnect();
    };
  }, []);

  const drawFrame = useCallback(async (url: string) => {
    let bitmap: ImageBitmap | undefined;
    try {
      const canvas = canvasRef.current;
      if (!canvas) return;

      bitmap = await createImageBitmap(await (await fetch(url)).blob());
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas 2D context is unavailable");

      const scale = Math.min(
        canvas.width / bitmap.width,
        canvas.height / bitmap.height
      );
      const width = bitmap.width * scale;
      const height = bitmap.height * scale;

      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(
        bitmap,
        (canvas.width - width) / 2,
        (canvas.height - height) / 2,
        width,
        height
      );
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      alert("Frame rendering error: " + message);
    } finally {
      bitmap?.close();
    }
  }, []);

  const waitForConnected = (timeoutMs = 5000) =>
    new Promise<void>((resolve, reject) => {
      let unlisten: UnlistenFn | undefined;

      const timer = setTimeout(() => {
        unlisten?.();
        reject(new Error("Connection timeout"));
      }, timeoutMs);

      listen<string>("conn-status", (e) => {
        if (e.payload.includes("connected")) {
          clearTimeout(timer);
          unlisten?.();
          resolve();
        }
      }).then((fn) => (unlisten = fn));
    });

  const doReconnect = useCallback(async () => {
    if (isReconnecting) return;

    try {
      setIsReconnecting(true);
      const params = new URLSearchParams(window.location.search);
      const ip = params.get("ip");
      if (!ip) throw new Error("TV address is missing from the page URL");

      await api.connect(ip);
      await waitForConnected();

      const resolution = params.get("resolution");
      const rdtMode = params.get("rdtMode");
      if (resolution && rdtMode) {
        await api.sendCmd(`sz ${resolution} ${rdtMode}`);
      }

      setShowReconnectBtn(false);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      alert("Reconnect failed: " + message);
      setShowReconnectBtn(true);
    } finally {
      setIsReconnecting(false);
    }
  }, [isReconnecting]);

  const handleDisconnect = async () => {
    try {
      await api.disconnect();
    } catch (e: unknown) {
      console.warn("Disconnect failed", e);
    } finally {
      router.push("/");
    }
  };

  useEffect(() => {
    if (!isTauri) {
      return;
    }

    let lastUrl: string | null = null;
    let unFrame: UnlistenFn | undefined;
    let unStatus: UnlistenFn | undefined;
    (async () => {
      unFrame = await api.onFrame(async (url) => {
        await drawFrame(url);
        if (lastUrl && lastUrl !== url) URL.revokeObjectURL(lastUrl);
        lastUrl = url;
      });

      unStatus = await api.onStatus((s) => {
        if (s.includes("disconnected") || s.includes("failed")) {
          setShowReconnectBtn(true);
        }

        if (s.includes("connected")) {
          setShowReconnectBtn(false);
        }
      });
    })();

    return () => {
      unFrame?.();
      unStatus?.();
      if (lastUrl) URL.revokeObjectURL(lastUrl);
    };
  }, [drawFrame]);

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-[#0b1020] text-white">
      <main
        ref={splitPaneRef}
        className="grid min-h-0 w-full flex-1 overflow-hidden p-2 sm:p-3 md:p-4"
        style={{
          gridTemplateColumns: showRemote
            ? `minmax(0, 1fr) 12px minmax(0, min(55vw, ${remoteWidth}px))`
            : "minmax(0, 1fr)",
          cursor: isResizing ? "col-resize" : undefined,
          transition: isResizing ? "none" : "grid-template-columns 300ms ease",
        }}
      >
        <div className="min-w-0 flex flex-col overflow-hidden">
          <div className="mb-4 flex items-center gap-4">
            <button
              onClick={handleDisconnect}
              className="rounded bg-gray-700 px-6 py-2"
            >
              ← Home
            </button>

            {showReconnectBtn && (
              <button
                onClick={doReconnect}
                disabled={isReconnecting}
                className="rounded bg-blue-600 px-6 py-2"
              >
                {isReconnecting ? "Reconnecting..." : "↻ Reconnect"}
              </button>
            )}

            <button
              onClick={() => setShowRemote(!showRemote)}
              className="shrink-0 rounded bg-gray-700 px-4 py-2 transition-colors hover:bg-gray-600"
              title={showRemote ? "Hide Remote" : "Show Remote"}
              aria-expanded={showRemote}
            >
              {showRemote ? "← Hide Remote" : "Show Remote →"}
            </button>

            <button
              onClick={() => setShowShell((visible) => !visible)}
              className="shrink-0 rounded bg-gray-700 px-4 py-2 transition-colors hover:bg-gray-600"
              title={showShell ? "Hide SSH Terminal" : "Show SSH Terminal"}
              aria-expanded={showShell}
            >
              {showShell ? "Hide Shell" : "Show Shell"}
            </button>

            <h3 className="text-xl font-bold text-gray-300">TV Screen</h3>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden">
            <canvas
              ref={canvasRef}
              className="h-full w-full rounded-xl bg-black"
            />
          </div>
          <Shell visible={showShell} />
        </div>

        {showRemote && (
          <>
            <div
              role="separator"
              aria-label="Resize remote sidebar"
              aria-orientation="vertical"
              aria-valuemin={180}
              aria-valuemax={520}
              aria-valuenow={remoteWidth}
              tabIndex={0}
              onPointerDown={(event) => {
                event.preventDefault();
                setIsResizing(true);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft") {
                  event.preventDefault();
                  resizeRemote(remoteWidth + 16);
                } else if (event.key === "ArrowRight") {
                  event.preventDefault();
                  resizeRemote(remoteWidth - 16);
                }
              }}
              className="group relative flex cursor-col-resize touch-none items-center justify-center outline-none"
              title="Drag to resize remote panel"
            >
              <span className="h-12 w-1 rounded-full bg-slate-600 transition-colors group-hover:bg-blue-500 group-focus-visible:bg-blue-500" />
            </div>
            <aside className="min-h-0 min-w-0 overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-xl">
              <RemoteUI />
            </aside>
          </>
        )}
      </main>
    </div>
  );
}