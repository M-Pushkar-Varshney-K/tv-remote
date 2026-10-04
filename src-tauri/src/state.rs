use std::net::TcpStream;
use std::sync::{mpsc::Sender, Arc, Mutex};

pub enum SshMessage {
    Input(Vec<u8>),
    Close,
}

pub struct SshSession {
    pub id: u64,
    pub sender: Sender<SshMessage>,
}

#[derive(Clone)]
pub struct AppState {
    pub cmd_socket: Arc<Mutex<Option<TcpStream>>>,
    pub image_socket: Arc<Mutex<Option<TcpStream>>>,
    pub ssh_session: Arc<Mutex<Option<SshSession>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            cmd_socket: Arc::new(Mutex::new(None)),
            image_socket: Arc::new(Mutex::new(None)),
            ssh_session: Arc::new(Mutex::new(None)),
        }
    }
}
