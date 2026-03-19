use std::io::{Read, Write};
use std::net::TcpStream;
use std::thread;
use tauri::AppHandle;
use crate::state::AppState;

use tauri::Emitter;
const IMAGE_PORT: u16 = 8080;
const CMD_PORT: u16 = 9990;
const MAX_FRAME: usize = 10 * 1024 * 1024;

// ---------------- IMAGE SOCKET ----------------
pub fn start_image_socket(app: AppHandle, host: String) {
    thread::spawn(move || {
        match TcpStream::connect((host.as_str(), IMAGE_PORT)) {
            Ok(mut stream) => {
                app.emit("conn-status", "image connected").ok();

                let mut buf = Vec::new();
                let mut tmp = [0u8; 65536];
                let mut frame_len: Option<usize> = None;

                loop {
                    let n = match stream.read(&mut tmp) {
                        Ok(n) => n,
                        Err(_) => break,
                    };

                    buf.extend_from_slice(&tmp[..n]);

                    loop {
                        if frame_len.is_none() {
                            if buf.len() < 4 { break; }
                            let len = u32::from_be_bytes([buf[0], buf[1], buf[2], buf[3]]) as usize;
                            buf.drain(0..4);

                            if len == 0 || len > MAX_FRAME {
                                return;
                            }

                            frame_len = Some(len);
                        }

                        if let Some(len) = frame_len {
                            if buf.len() < len { break; }

                            let frame = buf.drain(0..len).collect::<Vec<u8>>();
                            app.emit("image-frame", frame).ok();

                            frame_len = None;
                        }
                    }
                }
            }
            Err(_) => {
                app.emit("conn-status", "image failed").ok();
            }
        }
    });
}

// ---------------- CMD SOCKET ----------------
pub fn start_cmd_socket(app: AppHandle, host: String, state: AppState) {
    thread::spawn(move || {
        match TcpStream::connect((host.as_str(), CMD_PORT)) {
            Ok(mut stream) => {
                app.emit("conn-status", "cmd connected").ok();

                // store socket globally
                {
                    let mut lock = state.cmd_socket.lock().unwrap();
                    *lock = Some(stream.try_clone().unwrap());
                }

                let mut buf = Vec::new();
                let mut tmp = [0u8; 1024];

                loop {
                    let n = match stream.read(&mut tmp) {
                        Ok(n) => n,
                        Err(_) => break,
                    };

                    buf.extend_from_slice(&tmp[..n]);

                    while let Some(pos) = buf.iter().position(|&b| b == b'\n') {
                        let line = String::from_utf8_lossy(&buf[..pos]).to_string();
                        buf.drain(0..pos + 1);

                        app.emit("cmd-reply", line).ok();
                    }
                }
            }
            Err(_) => {
                app.emit("conn-status", "cmd failed").ok();
            }
        }
    });
}

// ---------------- SEND CMD ----------------
pub fn send_cmd(state: &AppState, cmd: String) -> Result<(), String> {
    let mut lock = state.cmd_socket.lock().unwrap();

    if let Some(sock) = lock.as_mut() {
        let line = if cmd.ends_with('\n') { cmd } else { cmd + "\n" };
        sock.write_all(line.as_bytes()).map_err(|e| e.to_string())
    } else {
        Err("Socket not connected".into())
    }
}