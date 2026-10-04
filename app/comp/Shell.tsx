"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { api } from "@/lib/api";
import "@xterm/xterm/css/xterm.css";

type ShellStatus = "disconnected" | "connecting" | "connected" | "failed";

const maxTerminalHeight = () =>
  typeof window === "undefined" ? 420 : window.innerHeight * 0.7;

type ShellProps = {
  visible: boolean;
};

export default function Shell({ visible }: ShellProps) {
  const terminalElement = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const hostRef = useRef("");
  const resizeStartY = useRef(0);
  const resizeStartHeight = useRef(0);
  const statusRef = useRef<ShellStatus>("disconnected");
  const [status, setStatus] = useState<ShellStatus>("disconnected");
  const [collapsed, setCollapsed] = useState(false);
  const [height, setHeight] = useState(256);
  const [resizing, setResizing] = useState(false);
  const [error, setError] = useState("");

  const updateStatus = useCallback((next: ShellStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const updateHeight = useCallback((nextHeight: number) => {
    const maxHeight = window.innerHeight * 0.7;
    const next = Math.max(Math.min(120, maxHeight), Math.min(maxHeight, nextHeight));
    setHeight(next);
    localStorage.setItem("sshTerminalHeight", String(Math.round(next)));
  }, []);

  useEffect(() => {
    hostRef.current = new URLSearchParams(window.location.search).get("ip") ?? "";
    const savedHeight = Number(localStorage.getItem("sshTerminalHeight"));
    const restoreHeight = requestAnimationFrame(() => {
      if (Number.isFinite(savedHeight) && savedHeight > 0) {
        updateHeight(savedHeight);
      }
    });

    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: false,
      scrollback: 5000,
      fontFamily: 'Consolas, "Cascadia Mono", monospace',
      fontSize: 13,
      theme: {
        background: "#080d16",
        foreground: "#dbe4f0",
        cursor: "#60a5fa",
        selectionBackground: "#334155",
      },
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(terminalElement.current!);
    terminalRef.current = terminal;
    fitRef.current = fit;

    const input = terminal.onData((value) => {
      if (statusRef.current !== "connected") return;
      void api
        .writeSsh(Array.from(new TextEncoder().encode(value)))
        .catch((cause: unknown) => {
          setError(cause instanceof Error ? cause.message : String(cause));
        });
    });

    let unlistenOutput: UnlistenFn | undefined;
    let unlistenStatus: UnlistenFn | undefined;
    let unlistenError: UnlistenFn | undefined;
    let disposed = false;

    void Promise.all([
      listen<number[]>("ssh-output", (event) => {
        terminal.write(Uint8Array.from(event.payload));
      }),
      listen<string>("ssh-status", (event) => {
        const next = event.payload as ShellStatus;
        if (
          next === "connecting" ||
          next === "connected" ||
          next === "disconnected" ||
          next === "failed"
        ) {
          updateStatus(next);
          if (next === "connected" || next === "disconnected") setError("");
        }
      }),
      listen<number[]>("ssh-error", (event) => {
        setError(
          (current) =>
            current + new TextDecoder().decode(Uint8Array.from(event.payload))
        );
      }),
    ])
      .then(([outputListener, statusListener, errorListener]) => {
        if (disposed) {
          outputListener();
          statusListener();
          errorListener();
          return;
        }
        unlistenOutput = outputListener;
        unlistenStatus = statusListener;
        unlistenError = errorListener;
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      });

    const resizeObserver = new ResizeObserver(() => {
      if (
        terminalElement.current?.clientWidth &&
        terminalElement.current.clientHeight
      ) {
        fit.fit();
      }
    });
    if (terminalElement.current) resizeObserver.observe(terminalElement.current);

    return () => {
      cancelAnimationFrame(restoreHeight);
      disposed = true;
      unlistenOutput?.();
      unlistenStatus?.();
      unlistenError?.();
      resizeObserver.disconnect();
      input.dispose();
      terminal.dispose();
      terminalRef.current = null;
      fitRef.current = null;
      void api.closeSsh().catch(() => {});
    };
  }, [updateHeight, updateStatus]);

  useEffect(() => {
    if (!resizing) return;

    const resize = (event: PointerEvent) => {
      updateHeight(
        resizeStartHeight.current + resizeStartY.current - event.clientY
      );
    };
    const stopResize = () => setResizing(false);

    window.addEventListener("pointermove", resize);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
    return () => {
      window.removeEventListener("pointermove", resize);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
    };
  }, [resizing, updateHeight]);

  useEffect(() => {
    const fitToViewport = () => updateHeight(height);
    window.addEventListener("resize", fitToViewport);
    return () => window.removeEventListener("resize", fitToViewport);
  }, [height, updateHeight]);

  useEffect(() => {
    if (!collapsed) requestAnimationFrame(() => fitRef.current?.fit());
  }, [collapsed]);

  const connect = async () => {
    const host = hostRef.current;
    if (!host) {
      setError("No TV IP address is present in the page URL.");
      return;
    }

    setError("");
    terminalRef.current?.clear();
    updateStatus("connecting");
    try {
      await api.startSsh(host);
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      updateStatus("failed");
    }
  };

  const disconnect = async () => {
    try {
      await api.closeSsh();
      updateStatus("disconnected");
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const connected = status === "connected";
  const statusColor = connected
    ? "bg-emerald-400"
    : status === "connecting"
      ? "bg-amber-400"
      : status === "failed"
        ? "bg-red-400"
        : "bg-slate-500";

  return (
    <section
      className={`box-border ${
        visible ? "flex" : "hidden"
      } w-full min-w-0 max-w-full shrink-0 flex-col overflow-hidden border-t border-slate-700 bg-[#080d16]`}
      style={{ height: collapsed ? 40 : height, maxWidth: "100%" }}
      aria-label="SSH terminal"
    >
      {!collapsed && (
        <div
          role="separator"
          aria-label="Resize terminal height"
          aria-orientation="horizontal"
          aria-valuemin={120}
          aria-valuemax={Math.round(maxTerminalHeight())}
          aria-valuenow={Math.round(height)}
          tabIndex={0}
          onPointerDown={(event) => {
            event.preventDefault();
            resizeStartY.current = event.clientY;
            resizeStartHeight.current = height;
            setResizing(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowUp") {
              event.preventDefault();
              updateHeight(height + 16);
            } else if (event.key === "ArrowDown") {
              event.preventDefault();
              updateHeight(height - 16);
            }
          }}
          className={`group flex h-2 w-full shrink-0 cursor-row-resize touch-none items-center justify-center ${
            resizing ? "bg-blue-500/20" : "bg-transparent hover:bg-blue-500/10"
          }`}
          title="Drag to resize terminal"
        >
          <span className="h-1 w-12 rounded-full bg-slate-600 group-hover:bg-blue-400" />
        </div>
      )}
      <header className="flex h-10 w-full min-w-0 shrink-0 items-center gap-3 border-b border-slate-800 px-3">
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          className="text-left text-sm font-semibold text-slate-200 hover:text-white"
          aria-label={collapsed ? "Show SSH terminal" : "Hide SSH terminal"}
          aria-expanded={!collapsed}
        >
          {collapsed ? "Show SSH Terminal" : "SSH Terminal"}
        </button>
        <span className="flex items-center gap-2 text-xs text-slate-400">
          <span className={`h-2 w-2 rounded-full ${statusColor}`} />
          {status === "connected"
            ? "Connected"
            : status === "connecting"
              ? "Connecting"
              : status === "failed"
                ? "Connection failed"
                : "Disconnected"}
        </span>
        {error && (
          <span className="min-w-0 flex-1 truncate text-xs text-red-300" title={error}>
            {error}
          </span>
        )}
        <div className="ml-auto flex gap-2">
          {connected ? (
            <button
              type="button"
              onClick={disconnect}
              className="rounded bg-slate-700 px-3 py-1 text-xs text-white hover:bg-slate-600"
            >
              Disconnect
            </button>
          ) : (
            <button
              type="button"
              onClick={connect}
              disabled={status === "connecting"}
              className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-500 disabled:opacity-50"
            >
              Connect
            </button>
          )}
        </div>
      </header>
      <div
        ref={terminalElement}
        className="xterm-container box-border min-h-0 w-full min-w-0 max-w-full flex-1 overflow-hidden px-2 py-1"
      />
    </section>
  );
}
