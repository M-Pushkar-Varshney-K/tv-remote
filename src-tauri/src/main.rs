mod sockets;
mod state;

use state::AppState;
use std::net::Shutdown;
use tauri::State;

#[tauri::command]
fn connect(app: tauri::AppHandle, state: State<AppState>, ip: String) -> Result<(), String> {
    if ip.trim().is_empty() {
        return Err("Empty IP".into());
    }

    sockets::start_image_socket(app.clone(), ip.clone(), state.inner().clone());
    sockets::start_cmd_socket(app, ip, state.inner().clone());

    Ok(())
}

#[tauri::command]
fn disconnect(state: State<AppState>) -> Result<(), String> {
    let mut cmd_lock = state.cmd_socket.lock().map_err(|e| e.to_string())?;
    if let Some(stream) = cmd_lock.take() {
        stream.shutdown(Shutdown::Both).ok();
    }

    let mut image_lock = state.image_socket.lock().map_err(|e| e.to_string())?;
    if let Some(stream) = image_lock.take() {
        stream.shutdown(Shutdown::Both).ok();
    }

    Ok(())
}

#[tauri::command]
fn send_cmd(state: State<AppState>, cmd: String) -> Result<(), String> {
    sockets::send_cmd(&state, cmd)
}

fn main() {
    tauri::Builder::default()
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![connect, disconnect, send_cmd])
        .run(tauri::generate_context!())
        .expect("error");
}