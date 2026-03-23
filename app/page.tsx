"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api"; // ✅ Tauri API

export default function Home() {
  const [ip, setIp] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [pixels, setPixels] = useState("");
  const [type, setType] = useState("");

  const router = useRouter();

  const connect = useCallback(async () => {
    setStatus("");

    const ipTrimmed = ip.trim();

    // ✅ validation
    if (!ipTrimmed) {
      setStatus("Please enter an IP address.");
      return;
    }
    if (!pixels || !type) {
      setStatus("Please select ratio and type");
      return;
    }

    try {
      setLoading(true);
      // ✅ Tauri backend call
      await api.connect(ipTrimmed);
      
      await api.sendCmd(`sz ${pixels} ${type}`);
   
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
  }, [ip, router, pixels, type]);

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
        </div>

        {/* Ratio */}
        <div style={{ display: "flex", gap: 12 }}>
          <div>
            <p>Select Ratio</p>

            <label>
              <input
                type="radio"
                name="type"
                value="-al"
                checked={pixels === "-al"}
                onChange={(e) => setPixels(e.target.value)}
              />
              16:9
            </label>

            <label>
              <input
                type="radio"
                name="type"
                value="-h"
                checked={pixels === "-h"}
                onChange={(e) => setPixels(e.target.value)}
              />
              4:3
            </label>
          </div>
        </div>

        {/* Type */}
        <div style={{ display: "flex", gap: 12 }}>
          <div>
            <p>Select Type</p>

            <label>
              <input
                type="radio"
                name="type1"
                value="pushkar"   // ✅ FIXED (matches backend)
                checked={type === "pushkar"}
                onChange={(e) => setType(e.target.value)}
              />
              pushkar
            </label>

            <label>
              <input
                type="radio"
                name="type1"
                value="Don't_know"
                checked={type === "Don't_know"}
                onChange={(e) => setType(e.target.value)}
              />
              Don&apos;t know
            </label>
          </div>
        </div>

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
  );
}