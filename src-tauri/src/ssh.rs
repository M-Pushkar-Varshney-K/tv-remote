use crate::state::{AppState, SshMessage, SshSession};
use std::io::{Read, Write};
use std::net::IpAddr;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{self, TryRecvError};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

static NEXT_SESSION_ID: AtomicU64 = AtomicU64::new(1);

pub fn start(app: AppHandle, state: AppState, host: String) -> Result<(), String> {
    let address: IpAddr = host
        .parse()
        .map_err(|_| "SSH host must be a valid IP address".to_string())?;
    let destination = match address {
        IpAddr::V4(ip) => format!("root@{ip}"),
        IpAddr::V6(ip) => format!("root@[{ip}]"),
    };
    let mut active_session = state
        .ssh_session
        .lock()
        .map_err(|e| format!("SSH session lock failed: {e}"))?;
    if active_session.is_some() {
        return Err("An SSH session is already active".into());
    }

    let mut command = Command::new("ssh");
    command
        .args([
            "-tt",
            "-o",
            "BatchMode=yes",
            "-o",
            "StrictHostKeyChecking=accept-new",
            "-o",
            "ConnectTimeout=10",
            "-o",
            "ServerAliveInterval=30",
            "-o",
            "ServerAliveCountMax=3",
        ])
        .arg(destination)
        .env("TERM", "xterm-256color")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }

    let mut child = command
        .spawn()
        .map_err(|e| format!("Could not start OpenSSH: {e}"))?;
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Could not open SSH input stream".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Could not open SSH output stream".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Could not open SSH error stream".to_string())?;

    let id = NEXT_SESSION_ID.fetch_add(1, Ordering::Relaxed);
    let (sender, receiver) = mpsc::channel();
    *active_session = Some(SshSession { id, sender });
    drop(active_session);

    emit_status(&app, "connecting");
    let connected = Arc::new(AtomicBool::new(false));
    spawn_output_reader(app.clone(), stdout, false, connected.clone());
    spawn_output_reader(app.clone(), stderr, true, connected.clone());

    thread::spawn(move || {
        run_session(&app, &state, id, &mut child, stdin, receiver, connected);
    });

    Ok(())
}

pub fn write(state: &AppState, data: Vec<u8>) -> Result<(), String> {
    let session = state
        .ssh_session
        .lock()
        .map_err(|e| format!("SSH session lock failed: {e}"))?;
    let active = session
        .as_ref()
        .ok_or_else(|| "No active SSH session".to_string())?;
    active
        .sender
        .send(SshMessage::Input(data))
        .map_err(|e| format!("Could not send terminal input: {e}"))
}

pub fn close(state: &AppState) -> Result<(), String> {
    let session = state
        .ssh_session
        .lock()
        .map_err(|e| format!("SSH session lock failed: {e}"))?;
    if let Some(active) = session.as_ref() {
        let _ = active.sender.send(SshMessage::Close);
    }
    Ok(())
}

fn spawn_output_reader<R: Read + Send + 'static>(
    app: AppHandle,
    mut stream: R,
    diagnostic: bool,
    connected: Arc<AtomicBool>,
) {
    thread::spawn(move || {
        let mut buffer = [0u8; 4096];
        loop {
            match stream.read(&mut buffer) {
                Ok(0) => break,
                Ok(length) => {
                    let event = if diagnostic {
                        "ssh-error"
                    } else {
                        if !connected.swap(true, Ordering::Relaxed) {
                            emit_status(&app, "connected");
                        }
                        "ssh-output"
                    };
                    if app.emit(event, buffer[..length].to_vec()).is_err() {
                        break;
                    }
                }
                Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
                Err(_) => break,
            }
        }
    });
}

fn run_session(
    app: &AppHandle,
    state: &AppState,
    id: u64,
    child: &mut Child,
    mut stdin: std::process::ChildStdin,
    receiver: mpsc::Receiver<SshMessage>,
    connected: Arc<AtomicBool>,
) {
    let mut close_requested = false;

    loop {
        match receiver.try_recv() {
            Ok(SshMessage::Input(data)) => {
                if let Err(error) = stdin.write_all(&data) {
                    let _ = app.emit("ssh-error", error.to_string().into_bytes());
                    close_requested = true;
                }
            }
            Ok(SshMessage::Close) | Err(TryRecvError::Disconnected) => {
                close_requested = true;
            }
            Err(TryRecvError::Empty) => {}
        }

        if close_requested {
            let _ = child.kill();
        }

        match child.try_wait() {
            Ok(Some(status)) => {
                if close_requested || (connected.load(Ordering::Relaxed) && status.success()) {
                    emit_status(app, "disconnected");
                } else {
                    emit_status(app, "failed");
                }
                break;
            }
            Ok(None) => {}
            Err(error) => {
                let _ = app.emit("ssh-error", error.to_string().into_bytes());
                emit_status(app, "failed");
                let _ = child.kill();
                let _ = child.wait();
                break;
            }
        }

        thread::sleep(Duration::from_millis(20));
    }

    if let Ok(mut active) = state.ssh_session.lock() {
        if active.as_ref().is_some_and(|session| session.id == id) {
            *active = None;
        }
    }
}

fn emit_status(app: &AppHandle, status: &str) {
    let _ = app.emit("ssh-status", status);
}
