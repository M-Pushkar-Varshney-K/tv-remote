use std::net::TcpStream;
use std::sync::{Arc, Mutex};

#[derive(Clone)]
pub struct AppState {
    pub cmd_socket: Arc<Mutex<Option<TcpStream>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            cmd_socket: Arc::new(Mutex::new(None)),
        }
    }
}