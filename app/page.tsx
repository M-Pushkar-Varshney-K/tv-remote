"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api"; // ✅ Tauri API

export default function Home() {
  const [ip, setIp] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const router = useRouter();

  const connect = useCallback(async () => {
    setStatus("");

    const ipTrimmed = ip.trim();

    // ✅ validation
    if (!ipTrimmed) {
      setStatus("Please enter an IP address.");
      return;
    }

    try {
      setLoading(true);

      // ✅ Tauri backend call
      await api.connect(ipTrimmed);

      // ✅ navigate to next page
      router.push("/remote");
    } catch (err: unknown) {
      console.error(err);

      const message =
        err instanceof Error ? err.message : String(err);

      setStatus(`Connection failed: ${message}`);
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
        <h2 style={{ marginTop: 0 }}>Connect to Server</h2>

        <div style={{ display: "grid", gap: 12 }}>
          {/* IP INPUT */}
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
                padding: 10,
                borderRadius: 8,
                border: "1px solid #333",
                background: "#0f172a",
                color: "#e5e7eb",
                marginTop: 6,
              }}
            />
          </label>

          {/* STATUS */}
          {status && (
            <div style={{ color: "#ff8a8a", fontSize: 13 }}>
              {status}
            </div>
          )}

          {/* BUTTON */}
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