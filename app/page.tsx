"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { listen } from "@tauri-apps/api/event";

export default function Home() {
  const [ip, setIp] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const [resolution, setResolution] = useState("_960_540");
  const [rdtMode, setRdtMode] = useState("OSD_ONLY");

  const resolutions = [
    { key: "_1920_1080", label: "1920 × 1080" },
    { key: "_1280_720", label: "1280 × 720" },
    { key: "_960_540", label: "960 × 540" },
    { key: "_640_480", label: "640 × 480" },
    { key: "_320_240", label: "320 × 240" },
  ];

  const rdtModes = [
    { key: "OSD_ONLY", label: "OSD only" },
    { key: "OSD_VIDEO", label: "OSD + Video" },
  ];

  const router = useRouter();

  const waitForEvent = async <T = any>(
    eventName: string,
    predicate?: (payload: T) => boolean,
    timeoutMs = 5000
  ): Promise<T> => {
    let unlisten: (() => void) | undefined;

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        unlisten?.();
        reject(new Error("Timeout"));
      }, timeoutMs);

      const handlePayload = (event: { payload: T }) => {
        const payload = event.payload;
        if (!predicate || predicate(payload)) {
          clearTimeout(timer);
          unlisten?.();
          resolve(payload);
        }
      };

      listen<T>(eventName, handlePayload)
        .then((fn) => {
          unlisten = fn;
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  };

  const connect = useCallback(async () => {
    setStatus("");

    if (!ip.trim()) {
      setStatus("Please enter an IP address.");
      return;
    }

    try {
      const waitPromise = waitForEvent(
        "conn-status",
        (s) => s === "cmd connected" || s === "cmd failed",
        3000
      );

      await Promise.resolve();
      setLoading(true);
      await api.connect(ip.trim());

      const result = await waitPromise;
      if (result !== "cmd connected") {
        throw new Error("Connection failed");
      }

      await api.sendCmd(`sz ${resolution} ${rdtMode}`);
      router.push(`/remote?ip=${encodeURIComponent(ip)}&resolution=${encodeURIComponent(resolution)}&rdtMode=${encodeURIComponent(rdtMode)}`);
    } catch (err: any) {
      setStatus(err.message ?? "Connection failed");
    } finally {
      setLoading(false);
    }
  }, [ip, resolution, rdtMode, router]);

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-slate-900 to-slate-950 flex items-center justify-center overflow-hidden">
      <div className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl bg-white/5 backdrop-blur border border-white/10 shadow-xl p-6 sm:p-8">
        <h1 className="text-2xl font-semibold text-white mb-6 text-center">
          Connect to Server
        </h1>

        <div className="space-y-6">
          {/* IP input */}
          <div>
            <label className="text-sm text-slate-300">IP Address</label>
            <input
              value={ip}
              onChange={(e) => setIp(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { connect() } }}
              placeholder="192.168.0.10"
              className="mt-2 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Resolution */}
          <div>
            <p className="text-sm text-slate-300 mb-2">Resolution</p>
            <div className="grid grid-cols-2 gap-3">
              {resolutions.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setResolution(r.key)}
                  className={`rounded-lg border px-3 py-2 text-sm transition ${resolution === r.key
                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                      : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500"
                    }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* RDT Mode */}
          <div>
            <p className="text-sm text-slate-300 mb-2">RDT Mode</p>
            <div className="grid gap-3">
              {rdtModes.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setRdtMode(m.key)}
                  className={`rounded-lg border px-3 py-2 text-sm text-left transition ${rdtMode === m.key
                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                      : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500"
                    }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Status */}
          {status && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-2">
              {status}
            </p>
          )}

          {/* Button */}
          <button
            onClick={connect}
            disabled={loading}
            className={`w-full rounded-lg py-3 font-semibold transition ${loading
                ? "bg-slate-700 text-slate-400 cursor-not-allowed"
                : "bg-emerald-500 text-slate-900 hover:bg-emerald-400"
              }`}
          >
            {loading ? "Connecting…" : "Connect"}
          </button>
        </div>
      </div>
    </div>
  );
}