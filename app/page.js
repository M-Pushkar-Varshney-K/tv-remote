"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const [ip, setIp] = useState("");
  const [status, setStatus] = useState("");
  const router = useRouter();

  const connect = async () => {
    if (!ip) return;

    const res = await window.api.connect(ip);

    if (res?.ok) {
      router.push("/remote");
    } else {
      // router.push("/remote");
      setStatus(res?.error || "Connection failed");
    }
  };

  return (
    <div style={{
      height: "100vh",
      display: "grid",
      placeItems: "center",
      background: "#0b1020",
      color: "#fff"
    }}>
      <div style={{ width: 400 }}>
        <h2>Connect to TV</h2>
        <input
          value={ip}
          onChange={(e) => setIp(e.target.value)}
          placeholder="192.168.0.10"
          style={{ width: "100%", padding: 8 }}
        />
        <button
          onClick={connect}
          style={{ marginTop: 10, width: "100%", padding: 10 }}
        >
          Connect
        </button>
        {status && <p>{status}</p>}
      </div>
    </div>
  );
}