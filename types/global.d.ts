export {};

type FramePayload =
  | { dataUrl: string }
  | { type: "dataUrl" | "objectUrl"; value: string };

type StatusPayload = {
  image?: string;
  cmd?: string;
  reason?: string;
};

type ConnectResponse = {
  ok: boolean;
  error?: string;
};

type BridgeAPI = {
  connect?: (ip: string) => Promise<ConnectResponse>;
  sendCmd?: (cmd: string) => Promise<{ ok: boolean; error?: string }>;
  onStatus?: (cb: (s: StatusPayload) => void) => () => void;
  onFrame?: (cb: (f: FramePayload) => void) => () => void;
  onCmdReply?: (cb: (line: string) => void) => () => void;
};

declare global {
  interface Window {
    api?: BridgeAPI;
    tv?: BridgeAPI;
  }
}