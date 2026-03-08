"use client";

import { useEffect, useRef } from "react";

export default function Remote() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    window.api.onFrame(async (buffer) => {
      const blob = new Blob([buffer], { type: "image/jpeg" });
      const bitmap = await createImageBitmap(blob);

      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
    });
  }, []);

  const run = (cmd) => {
    window.api.runCommand(cmd);
  };

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      {/* LEFT IMAGE 85% */}
      <div style={{ flex: 0.85, background: "#000" }}>
        <canvas
          ref={canvasRef}
          width={1280}
          height={720}
          style={{ width: "100%", height: "100%" }}
        />
      </div>

      {/* RIGHT REMOTE 15% */}
      <div style={{
        flex: 0.15,
        background: "#111",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: 16
      }}>
        <button onClick={() => run("ls -al")}>Button 1</button>
        <button onClick={() => run("cmd2")}>Button 2</button>
        <button onClick={() => run("cmd3")}>Button 3</button>
      </div>
    </div>
  );
}