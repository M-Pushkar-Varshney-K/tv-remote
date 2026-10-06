"use client";

import { useEffect } from "react";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { api } from "@/lib/api";

type Btn = { label: string; cmd: string };

const BTN_MAP: Record<string, Btn> = {
  Power:     { label: "⏻",        cmd: "Power"    },
  Input:     { label: "Input",    cmd: "Input"    },
  TV_AV:     { label: "TV/AV",    cmd: "TV_AV"    },
  P_Only:    { label: "P.Only",   cmd: "P_Only"   },
  Info:      { label: "ℹ",        cmd: "Info"     },
  Settings:  { label: "⚙",        cmd: "Settings" },
  Home:      { label: "⌂",        cmd: "Home"     },
  MyApps:    { label: "Apps",     cmd: "MyApps"   },
  Up:        { label: "▲",        cmd: "Up"       },
  Down:      { label: "▼",        cmd: "Down"     },
  Left:      { label: "◀",        cmd: "Left"     },
  Right:     { label: "▶",        cmd: "Right"    },
  OK:        { label: "OK",       cmd: "OK"       },
  CH_up:     { label: "▲",        cmd: "CH_up"    },
  CH_down:   { label: "▼",        cmd: "CH_down"  },
  Vol_up:    { label: "+",        cmd: "Vol_up"   },
  Vol_down:  { label: "−",        cmd: "Vol_down" },
  Fav:       { label: "★",        cmd: "Fav"      },
  ThreeD:    { label: "3D",       cmd: "3D"       },
  Mute:      { label: "🔇",       cmd: "Mute"     },
  Arrow_Tab: { label: "⇥",        cmd: "Arrow_Tab"},
  Guide:     { label: "Guide",    cmd: "Guide"    },
  Exit:      { label: "Exit",     cmd: "Exit"     },
  Text:      { label: "Text",     cmd: "Text"     },
  T_Opt:     { label: "T.Opt",    cmd: "T_Opt"    },
  Q_Menu:    { label: "Q.Menu",   cmd: "Q_Menu"   },
  Rew:       { label: "⏮",        cmd: "Rew"      },
  Play:      { label: "▶",        cmd: "Play"     },
  Pause:     { label: "⏸",        cmd: "Pause"    },
  Fwd:       { label: "⏭",        cmd: "Fwd"      },
  Stop:      { label: "⏹",        cmd: "Stop"     },
  Rec:       { label: "⏺",        cmd: "Rec"      },
  InStart:   { label: "In.Start", cmd: "InStart"  },
  InStop:    { label: "In.Stop",  cmd: "InStop"   },
  ADJ:       { label: "ADJ",      cmd: "ADJ"      },
  Tilt:      { label: "Tilt",     cmd: "Tilt"     },
};

const NUMBERS: Btn[] = [
  { label: "1", cmd: "1" }, { label: "2", cmd: "2" }, { label: "3", cmd: "3" },
  { label: "4", cmd: "4" }, { label: "5", cmd: "5" }, { label: "6", cmd: "6" },
  { label: "7", cmd: "7" }, { label: "8", cmd: "8" }, { label: "9", cmd: "9" },
  { label: "List",   cmd: "List"   },
  { label: "0",      cmd: "0"      },
  { label: "Q.View", cmd: "Q.View" },
];

// Keyboard → cmd mapping
const KEY_MAP: Record<string, string> = {
  ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right",
  Enter: "OK",
  "0":"0","1":"1","2":"2","3":"3","4":"4",
  "5":"5","6":"6","7":"7","8":"8","9":"9",
};

export default function RemoteUI() {
  const run = async (cmd: string) => {
    try {
      await api.sendCmd(cmd);
      console.log("cmd:", cmd);
    } catch (e) {
      console.error(e);
    }
  };

  // Keyboard listener
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const cmd = KEY_MAP[e.key];
      if (cmd) { e.preventDefault(); run(cmd); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // --u is the single unit that drives every dimension.
  // It scales with viewport height so the remote always fits without scrolling.
  const root: React.CSSProperties = {
    ["--u"  as string]: "clamp(0.38rem, 2.2vh, 0.78rem)",
    ["--gap"as string]: "clamp(2px, 0.4vh, 6px)",
    ["--r"  as string]: "calc(var(--u) * 0.55)",  // border-radius unit
  };

  // Every button shares this base — one source of truth for look & feel
  const base: React.CSSProperties = {
    display: "flex", alignItems: "center", justifyContent: "center",
    cursor: "pointer", userSelect: "none", fontFamily: "inherit",
    width: "100%",
    height:       "calc(var(--u) * 2.3)",
    fontSize:     "calc(var(--u) * 0.82)",   // uniform text scale
    borderRadius: "var(--r)",
    fontWeight: 500,
    color: "#d4d4d4",
    background: "#242424",
    border: "1px solid rgba(255,255,255,0.07)",
    boxShadow: "0 2px 0 #050505, inset 0 1px 0 rgba(255,255,255,0.05)",
    transition: "transform 0.07s",
    lineHeight: 1,
  };

  const navBase: React.CSSProperties = {
    ...base,
    background: "#181818",
    border: "1px solid rgba(255,255,255,0.04)",
  };

  // Press animation — same feel for every button
  const press = (el: HTMLButtonElement) => { el.style.transform = "scale(0.91)"; };
  const lift  = (el: HTMLButtonElement) => { el.style.transform = ""; };
  const ph = {
    onMouseDown: (e: React.MouseEvent<HTMLButtonElement>) => press(e.currentTarget),
    onMouseUp:   (e: React.MouseEvent<HTMLButtonElement>) => lift(e.currentTarget),
    onMouseLeave:(e: React.MouseEvent<HTMLButtonElement>) => lift(e.currentTarget),
    onTouchStart:(e: React.TouchEvent<HTMLButtonElement>) => press(e.currentTarget),
    onTouchEnd:  (e: React.TouchEvent<HTMLButtonElement>) => lift(e.currentTarget),
  };

  const Btn = (b: Btn, extra: React.CSSProperties = {}, key?: string) => (
    <button key={key ?? b.cmd} onClick={() => run(b.cmd)} title={b.cmd}
      style={{ ...base, ...extra }} {...ph}>
      {b.label}
    </button>
  );

  const NavBtn = (b: Btn, extra: React.CSSProperties = {}, key?: string) => (
    <button key={key ?? b.cmd} onClick={() => run(b.cmd)} title={b.cmd}
      style={{ ...navBase, ...extra }} {...ph}>
      {b.label}
    </button>
  );

  const Row = ({ cols, children }: { cols: number; children: React.ReactNode }) => (
    <div style={{
      display: "grid",
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gap: "var(--gap)",
    }}>{children}</div>
  );

  const Line = () => <div style={{ borderTop: "1px solid #1c1c1c" }} />;

  return (
    <div style={{
      width: "100%", height: "100svh",
      background: "#080808",
      display: "flex", alignItems: "center", justifyContent: "center",
      overflow: "hidden",
    }}>
      {/* Remote shell — scales to always fit the screen height */}
      <div style={{
        ...root,
        width: "clamp(140px, 26vh, 320px)",
        borderRadius: "clamp(16px, 3.5vh, 40px)",
        background: "linear-gradient(170deg, #1d1d1d 0%, #0d0d0d 100%)",
        border: "1px solid rgba(255,255,255,0.06)",
        boxShadow: "0 20px 60px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.06)",
        padding: "clamp(8px,1.8vh,18px) clamp(8px,1.6vh,16px) clamp(10px,2vh,20px)",
        display: "flex", flexDirection: "column",
        gap: "clamp(4px, 0.9vh, 12px)",
      }}>

        {/* Power */}
        <div style={{ display: "flex", justifyContent: "center" }}>
          <button onClick={() => run("Power")} title="Power" {...ph} style={{
            ...base,
            width: "calc(var(--u) * 2.8)", height: "calc(var(--u) * 2.8)",
            borderRadius: "50%",
            background: "#7a1a1a",
            border: "1px solid rgba(239,68,68,0.25)",
            color: "#fff",
            fontSize: "calc(var(--u) * 1.1)",
            boxShadow: "0 3px 0 #3a0808, inset 0 1px 0 rgba(255,255,255,0.12)",
          }}>⏻</button>
        </div>

        {/* Source row */}
        <Row cols={3}>
          {Btn(BTN_MAP.Input)}
          {Btn(BTN_MAP.TV_AV)}
          {Btn(BTN_MAP.P_Only)}
        </Row>

        {/* Info */}
        <div style={{ display: "flex", justifyContent: "center" }}>
          {Btn(BTN_MAP.Info, { width: "calc(var(--u)*2.3)", borderRadius: "50%" })}
        </div>

        <Line />

        {/* Numpad */}
        <Row cols={3}>
          {NUMBERS.map(n => Btn(n, {
            fontSize: n.cmd.length > 1 ? "calc(var(--u)*0.6)" : "calc(var(--u)*0.92)",
          }, `num-${n.cmd}`))}
        </Row>

        <Line />

        {/* Settings / Home / Apps */}
        <Row cols={3}>
          {Btn(BTN_MAP.Settings)}
          {Btn(BTN_MAP.Home, { fontSize: "calc(var(--u)*1.05)" })}
          {Btn(BTN_MAP.MyApps)}
        </Row>

        <Line />

        {/* D-Pad + CH + VOL */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--gap)" }}>

          {/* CH */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
            <span style={{ fontSize: "calc(var(--u)*0.55)", color: "#444", fontWeight: 700, letterSpacing: "0.08em" }}>CH</span>
            {NavBtn(BTN_MAP.CH_up,   { width: "calc(var(--u)*2.1)", height: "calc(var(--u)*1.9)", borderRadius: "6px 6px 2px 2px" })}
            {NavBtn(BTN_MAP.CH_down, { width: "calc(var(--u)*2.1)", height: "calc(var(--u)*1.9)", borderRadius: "2px 2px 6px 6px" })}
          </div>

          {/* D-Pad grid */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "calc(var(--u)*2) calc(var(--u)*2.6) calc(var(--u)*2)" as string,
            gridTemplateRows:    "calc(var(--u)*1.7) calc(var(--u)*2.6) calc(var(--u)*1.7)" as string,
            gap: "2px",
          } as React.CSSProperties}>
            <div />
            {NavBtn(BTN_MAP.Up,    { width:"100%",height:"100%", borderRadius:"6px 6px 2px 2px" }, "up")}
            <div />
            {NavBtn(BTN_MAP.Left,  { width:"100%",height:"100%", borderRadius:"6px 2px 2px 6px" }, "left")}
            <button onClick={() => run("OK")} title="OK" {...ph} style={{
              ...navBase, width:"100%", height:"100%",
              borderRadius:"50%", fontWeight:700,
              fontSize:"calc(var(--u)*0.72)",
              background:"#2c2c2c",
              border:"1px solid rgba(255,255,255,0.09)",
            }}>OK</button>
            {NavBtn(BTN_MAP.Right, { width:"100%",height:"100%", borderRadius:"2px 6px 6px 2px" }, "right")}
            <div />
            {NavBtn(BTN_MAP.Down,  { width:"100%",height:"100%", borderRadius:"2px 2px 6px 6px" }, "down")}
            <div />
          </div>

          {/* VOL */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
            <span style={{ fontSize: "calc(var(--u)*0.55)", color: "#444", fontWeight: 700, letterSpacing: "0.08em" }}>VOL</span>
            {NavBtn(BTN_MAP.Vol_up,   { width: "calc(var(--u)*2.1)", height: "calc(var(--u)*1.9)", borderRadius: "6px 6px 2px 2px", fontSize: "calc(var(--u)*1.0)" })}
            {NavBtn(BTN_MAP.Vol_down, { width: "calc(var(--u)*2.1)", height: "calc(var(--u)*1.9)", borderRadius: "2px 2px 6px 6px", fontSize: "calc(var(--u)*1.0)" })}
          </div>
        </div>

        <Line />

        {/* Fav / 3D / Mute / Tab */}
        <Row cols={4}>
          {Btn(BTN_MAP.Fav)}
          {Btn(BTN_MAP.ThreeD)}
          {Btn(BTN_MAP.Mute)}
          {Btn(BTN_MAP.Arrow_Tab)}
        </Row>

        {/* Guide / Exit */}
        <Row cols={2}>
          {Btn(BTN_MAP.Guide)}
          {Btn(BTN_MAP.Exit)}
        </Row>

        {/* Color keys */}
        <Row cols={4}>
          {([ ["Red","#b91c1c"],["Green","#15803d"],["Yellow","#b45309"],["Blue","#1d4ed8"] ] as [string,string][])
            .map(([cmd, bg]) => (
              <button key={cmd} onClick={() => run(cmd)} title={cmd}
                onMouseDown={e=>(e.currentTarget.style.opacity="0.55")}
                onMouseUp={e=>(e.currentTarget.style.opacity="1")}
                onMouseLeave={e=>(e.currentTarget.style.opacity="1")}
                onTouchStart={e=>(e.currentTarget.style.opacity="0.55")}
                onTouchEnd={e=>(e.currentTarget.style.opacity="1")}
                style={{
                  height: "calc(var(--u)*0.7)", border:"none",
                  borderRadius:"3px", background:bg,
                  cursor:"pointer", transition:"opacity 0.1s", width:"100%",
                }}/>
            ))}
        </Row>

        <Line />

        {/* Text / T.Opt / Q.Menu / Info */}
        <Row cols={4}>
          {Btn(BTN_MAP.Text,   { fontSize:"calc(var(--u)*0.68)" })}
          {Btn(BTN_MAP.T_Opt,  { fontSize:"calc(var(--u)*0.68)" })}
          {Btn(BTN_MAP.Q_Menu, { fontSize:"calc(var(--u)*0.6)"  })}
          {Btn(BTN_MAP.Info,   {}, "info-2")}
        </Row>

        {/* Playback */}
        <Row cols={4}>
          {Btn(BTN_MAP.Rew)}
          {Btn(BTN_MAP.Play)}
          {Btn(BTN_MAP.Pause)}
          {Btn(BTN_MAP.Fwd)}
        </Row>

        <Row cols={4}>
          {Btn(BTN_MAP.Stop)}
          {Btn(BTN_MAP.Rec, { color: "#f87171" })}
          <div /><div />
        </Row>

        <Line />

        {/* Device control */}
        <Row cols={2}>
          {Btn(BTN_MAP.InStart, { fontSize:"calc(var(--u)*0.65)" })}
          {Btn(BTN_MAP.InStop,  { fontSize:"calc(var(--u)*0.65)" })}
          {Btn(BTN_MAP.ADJ)}
          {Btn(BTN_MAP.Tilt)}
        </Row>

      </div>
    </div>
  );
}