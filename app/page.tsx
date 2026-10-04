"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { load } from "@tauri-apps/plugin-store";
import { api } from "@/lib/api";

type ConnectionSettings = {
  ip: string;
  resolution: string;
  rdtMode: string;
};

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

const isTauri = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function waitForCommandConnection() {
  let resolveResult!: (status: string) => void;
  let rejectResult!: (error: Error) => void;
  let unlisten: UnlistenFn | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const result = new Promise<string>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });
  void result.catch(() => {});
  const ready = listen<string>("conn-status", (event) => {
    if (event.payload === "cmd connected" || event.payload === "cmd failed") {
      if (timer) clearTimeout(timer);
      unlisten?.();
      if (event.payload === "cmd connected") resolveResult(event.payload);
      else rejectResult(new Error("Could not connect to the TV command service."));
    }
  }).then((stopListening) => {
    unlisten = stopListening;
    timer = setTimeout(() => {
      unlisten?.();
      rejectResult(new Error("Timed out while connecting to the TV."));
    }, 5000);
  });

  return {
    ready,
    result,
    cancel: async () => {
      await ready.catch(() => {});
      if (timer) clearTimeout(timer);
      unlisten?.();
    },
  };
}

export default function Home() {
  const router = useRouter();
  const [ip, setIp] = useState("");
  const [resolution, setResolution] = useState("_960_540");
  const [rdtMode, setRdtMode] = useState("OSD_ONLY");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      try {
        let saved: unknown;
        if (isTauri()) {
          const store = await load("settings.json", { autoSave: false });
          saved = await store.get<unknown>("lastConnection");
        } else {
          const value = localStorage.getItem("lastConnection");
          saved = value ? JSON.parse(value) : undefined;
        }

        if (cancelled || !saved || typeof saved !== "object") return;
        const settings = saved as Partial<ConnectionSettings>;
        if (typeof settings.ip === "string") setIp(settings.ip);
        if (
          typeof settings.resolution === "string" &&
          resolutions.some((item) => item.key === settings.resolution)
        ) {
          setResolution(settings.resolution);
        }
        if (
          typeof settings.rdtMode === "string" &&
          rdtModes.some((item) => item.key === settings.rdtMode)
        ) {
          setRdtMode(settings.rdtMode);
        }
      } catch (error: unknown) {
        if (!cancelled) {
          setStatus(
            `Could not restore saved connection: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      } finally {
        if (!cancelled) setRestoring(false);
      }
    };

    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const connect = async () => {
    const address = ip.trim();
    if (!address) {
      setStatus("Please enter an IP address.");
      return;
    }

    setStatus("");
    setLoading(true);
    let connection: Awaited<ReturnType<typeof waitForCommandConnection>> | undefined;
    try {
      connection = await waitForCommandConnection();
      await connection.ready;
      await api.connect(address);
      await connection.result;
      await api.sendCmd(`sz ${resolution} ${rdtMode}`);

      const settings = { ip: address, resolution, rdtMode };
      if (isTauri()) {
        const store = await load("settings.json", { autoSave: false });
        await store.set("lastConnection", settings);
        await store.save();
      } else {
        localStorage.setItem("lastConnection", JSON.stringify(settings));
      }

      router.push(
        `/remote?ip=${encodeURIComponent(address)}&resolution=${encodeURIComponent(
          resolution
        )}&rdtMode=${encodeURIComponent(rdtMode)}`
      );
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : "Connection failed.");
      try {
        await api.disconnect();
      } catch (disconnectError: unknown) {
        console.error("Could not clean up failed connection", disconnectError);
      }
    } finally {
      await connection?.cancel();
      setLoading(false);
    }
  };

  return (
    <main className="fixed inset-0 flex items-center justify-center overflow-hidden bg-gradient-to-br from-slate-900 to-slate-950">
      <section className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl backdrop-blur sm:p-8">
        <h1 className="mb-6 text-center text-2xl font-semibold text-white">
          Connect to Server
        </h1>

        <div className="space-y-6">
          <div>
            <label htmlFor="ip-address" className="text-sm text-slate-300">
              IP Address
            </label>
            <input
              id="ip-address"
              value={ip}
              disabled={restoring || loading}
              onChange={(event) => setIp(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void connect();
              }}
              placeholder="192.168.0.10"
              autoComplete="off"
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <fieldset>
            <legend className="mb-2 text-sm text-slate-300">Resolution</legend>
            <div className="grid grid-cols-2 gap-3">
              {resolutions.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  disabled={restoring || loading}
                  onClick={() => setResolution(item.key)}
                  aria-pressed={resolution === item.key}
                  className={`rounded-lg border px-3 py-2 text-sm transition ${
                    resolution === item.key
                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                      : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-sm text-slate-300">RDT Mode</legend>
            <div className="grid gap-3">
              {rdtModes.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  disabled={restoring || loading}
                  onClick={() => setRdtMode(item.key)}
                  aria-pressed={rdtMode === item.key}
                  className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                    rdtMode === item.key
                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                      : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </fieldset>

          {status && (
            <p
              role="alert"
              className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-sm text-red-400"
            >
              {status}
            </p>
          )}

          <button
            type="button"
            onClick={() => void connect()}
            disabled={loading || restoring}
            className={`w-full rounded-lg py-3 font-semibold transition ${
              loading || restoring
                ? "cursor-not-allowed bg-slate-700 text-slate-400"
                : "bg-emerald-500 text-slate-900 hover:bg-emerald-400"
            }`}
          >
            {restoring ? "Loading saved connection…" : loading ? "Connecting…" : "Connect"}
          </button>
        </div>
      </section>
    </main>
  );
}
