"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import RemoteUI from "@/app/comp/Remote";

export default function RemotePage() {
  const [sidebarWidth, setSidebarWidth] = useState(35);
  const [showRemote, setShowRemote] = useState(true);
  const [isDragging, setIsDragging] = useState(false);


  // Load sidebar width from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("remoteWidth");
    if (saved) setSidebarWidth(Number(saved));
  }, []);

  const handleWidthChange = useCallback((w: number) => {
    const clamped = Math.max(20, Math.min(60, w));
    setSidebarWidth(clamped);
    localStorage.setItem("remoteWidth", String(clamped));
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = (e.clientX / window.innerWidth) * 100;
      handleWidthChange(newWidth);
    };

    const handleMouseUp = () => setIsDragging(false);

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, handleWidthChange]);

  return (
    <div className="h-screen w-screen bg-slate-900 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between bg-gradient-to-r from-slate-800 to-slate-700 px-4 py-3 border-b border-slate-600 shadow-lg">
        <h1 className="text-white font-bold text-xl tracking-tight">🎬 TV Remote</h1>
        <button
          onClick={() => setShowRemote(!showRemote)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {showRemote ? "◀ Hide Remote" : "▶ Show Remote"}
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Video section - takes remaining space */}
        <div className="flex-1 bg-black flex items-center justify-center overflow-auto">
          <div className="text-slate-400 text-center">
            <p className="text-lg font-semibold mb-2">📺 Video Stream</p>
            <p className="text-sm">Connect to a server to see video here</p>
          </div>
        </div>

        {/* Sidebar with Remote - Resizable */}
        {showRemote && (
          <div
            className="bg-slate-800 border-l-2 border-slate-700 flex flex-col shadow-2xl transition-all"
            style={{
              width: `${sidebarWidth}%`,
              minWidth: "220px",
              maxWidth: "65%",
              cursor: isDragging ? "col-resize" : "default",
            }}
          >
            {/* Resize Handle */}
            <div
              className="w-1 bg-slate-600 hover:bg-blue-500 cursor-col-resize transition active:bg-blue-600 flex-shrink-0"
              onMouseDown={() => setIsDragging(true)}
              title="Drag to resize remote panel"
            />

            {/* Remote Content */}
            <div className="flex-1 min-h-0 p-3">
              <RemoteUI />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
