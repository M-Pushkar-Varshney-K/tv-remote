import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

type StatusPayload = string;
type CmdReplyPayload = string;
type FramePayload = number[];

export const api = {
  connect: (ip: string): Promise<void> =>
    invoke("connect", { ip }),

  setData: (): Promise<void> =>
    invoke("set_data"),

  sendCmd: (cmd: string): Promise<void> =>
    invoke("send_cmd", { cmd }),

  startSsh: (host: string): Promise<void> =>
    invoke("ssh_start", { host }),

  writeSsh: (data: number[]): Promise<void> =>
    invoke("ssh_write", { data }),

  closeSsh: (): Promise<void> =>
    invoke("ssh_close"),

  disconnect: (): Promise<void> => invoke("disconnect"),

  onFrame: async (cb: (url: string) => void): Promise<UnlistenFn> => {
    return listen<FramePayload>("image-frame", (e) => {
      const bytes = new Uint8Array(e.payload);
      const blob = new Blob([bytes], { type: "image/jpeg" });
      cb(URL.createObjectURL(blob));
    });
  },

  onStatus: async (cb: (s: StatusPayload) => void): Promise<UnlistenFn> => {
    return listen<StatusPayload>("conn-status", (e) => cb(e.payload));
  },

  onCmdReply: async (cb: (s: CmdReplyPayload) => void): Promise<UnlistenFn> => {
    return listen<CmdReplyPayload>("cmd-reply", (e) => cb(e.payload));
  },
};