"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const [ip, setIp] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const connect = useCallback(async () => {
    setStatus("");

    const ipTrimmed = ip.trim();
    if (!ipTrimmed) {
      setStatus("Please enter an IP address.");
      return;
    }

    // Accept either namespace from preload (both exposed)
    const bridge = (typeof window !== "undefined") && (window.api || window.tv);
    if (!bridge) {
      setStatus("Electron bridge not available. Start Electron + Renderer (npm run dev).");
      return;
    }
    if (typeof bridge.connect !== "function") {
      setStatus("connect() is not exposed by preload.");
      return;
    }

    try {
      setLoading(true);
      const res = await bridge.connect(ipTrimmed);
      if (res?.ok) {
        router.push("/remote");
      } else {
        setStatus(res?.error || `Could not connect to ${ipTrimmed}`);
      }
    } catch (err) {
      console.error(err);
      setStatus(`Connection failed: ${String(err?.message || err)}`);
    } finally {
      setLoading(false);
    }
  }, [ip, router]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#0b1020",
        color: "#fff",
        padding: 24,
      }}
    >
      <div
        style={{
          width: 420,
          background: "rgba(0,0,0,0.4)",
          padding: 20,
          borderRadius: 12,
          boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
        }}
      >
        <h2 style={{ marginTop: 0 }}>Connect with (Putty)</h2>

        <div style={{ display: "grid", gap: 10 }}>
          <label>
            IP address
            <input
              value={ip}
              onChange={(e) => setIp(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !loading) {
                  e.preventDefault();
                  connect();
                }
              }}
              placeholder="192.168.0.10"
              style={{
                width: "100%",
                padding: 8,
                borderRadius: 8,
                border: "1px solid #333",
                background: "#0f172a",
                color: "#e5e7eb",
                marginTop: 6,
              }}
            />
          </label>

          {status && (
            <div style={{ color: "#ff8a8a", fontSize: 13 }}>{status}</div>
          )}

          <button
            onClick={connect}
            disabled={loading}
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              border: "none",
              background: loading ? "#555" : "#22c55e",
              color: "#0b1020",
              fontWeight: 700,
              cursor: loading ? "default" : "pointer",
            }}
          >
            {loading ? "Connecting..." : "Connect"}
          </button>
        </div>
      </div>
    </div>
  );
}