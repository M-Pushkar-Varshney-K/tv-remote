#!/usr/bin/env python3

import socket
import threading
import signal
import subprocess
import time
import struct
import os
import json

# =========================
# CONSTANTS
# =========================
IMAGE_PORT = 8080
CMD_PORT = 9990
IMAGE_FILE = "/var/screencapture.jpg"

# =========================
# GLOBAL STATE (same as C++)
# =========================
sz = ""
mode_type = ""
CAPTURE_CMD = ""

# Track active connections
active_connections = 0
connection_lock = threading.Lock()

# Connection state
is_connected = False
is_connected_lock = threading.Lock()

stopServer = False
stop_lock = threading.Lock()

# =========================
# MAPS (same as C++)
# =========================
resolutionMap = {
    "_1920_1080": "\"width\":1920,\"height\":1080",
    "_1280_720": "\"width\":1280,\"height\":720",
    "_960_540": "\"width\":960,\"height\":540",
    "_640_480": "\"width\":640,\"height\":480",
    "_320_240": "\"width\":320,\"height\":240",
}

modeMap = {
    "OSD_VIDEO": "\"method\":\"DISPLAY\",",
    "OSD_ONLY": "\"method\":\"GRAPHIC\",",
}

cmdMap = {
    "TRIAL": "luna-send -f -n 1 luna://com.lge.inputgenerator/pushKeyEvent '{ \"eventtype\": \"key\", \"keycodenum\": 106}' > /dev/null 2>&1",
    "Power": "luna-send -f -n 1 luna://com.lge.inputgenerator/pushKeyEvent '{ \"eventtype\": \"key\", \"keycodenum\": 116}' > /dev/null 2>&1",
    "Home": "luna-send -n 1 -f luna://com.webos.service.networkinput/sendSpecialKey '{\"key\":\"RF_HOME\"}' > /dev/null 2>&1",
    "Live_TV": "luna-send -n 1 -f luna://com.webos.applicationManager/launch '{\"id\": \"com.webos.app.livetv\"}' > /dev/null 2>&1",
    "Back": "luna-send -f -n 1 luna://com.lge.inputgenerator/pushKeyEvent '{ \"eventtype\": \"key\", \"keycodenum\": 412}' > /dev/null 2>&1",
    "Up": "luna-send -f -n 1 luna://com.lge.inputgenerator/pushKeyEvent '{ \"eventtype\": \"key\", \"keycodenum\": 103}' > /dev/null 2>&1",
    "Down": "luna-send -f -n 1 luna://com.lge.inputgenerator/pushKeyEvent '{ \"eventtype\": \"key\", \"keycodenum\": 108}' > /dev/null 2>&1",
    "Left": "luna-send -f -n 1 luna://com.lge.inputgenerator/pushKeyEvent '{ \"eventtype\": \"key\", \"keycodenum\": 105}' > /dev/null 2>&1",
    "Right": "luna-send -f -n 1 luna://com.lge.inputgenerator/pushKeyEvent '{ \"eventtype\": \"key\", \"keycodenum\": 106}' > /dev/null 2>&1",
    "OK": "luna-send -f -n 1 luna://com.lge.inputgenerator/pushKeyEvent '{ \"eventtype\": \"key\", \"keycodenum\": 272}' > /dev/null 2>&1",
    "List": "luna-send -f -n 1 luna://com.lge.inputgenerator/pushKeyEvent '{ \"eventtype\": \"key\", \"keycodenum\": 787}' > /dev/null 2>&1",
    "Input": "luna-send -f -n 1 luna://com.lge.inputgenerator/pushKeyEvent '{ \"eventtype\": \"key\", \"keycodenum\": 241}' > /dev/null 2>&1",
    "GUIDE": "luna-send -f -n 1 luna://com.lge.inputgenerator/pushKeyEvent '{ \"eventtype\": \"key\", \"keycodenum\": 362}' > /dev/null 2>&1",
    "Cursor": "luna-send -f -n 1 luna://com.lge.inputgenerator/pushKeyEvent '{ \"eventtype\": \"key\", \"keycodenum\": 28}' > /dev/null 2>&1",
    "Vol_up": "luna-send -f -n 1 luna://com.lge.inputgenerator/pushKeyEvent '{ \"eventtype\": \"key\", \"keycodenum\": 115}' > /dev/null 2>&1",
    "Vol_down": "luna-send -f -n 1 luna://com.lge.inputgenerator/pushKeyEvent '{ \"eventtype\": \"key\", \"keycodenum\": 114}' > /dev/null 2>&1",
    "CH_up": "luna-send -f -n 1 luna://com.lge.inputgenerator/pushKeyEvent '{ \"eventtype\": \"key\", \"keycodenum\": 402}' > /dev/null 2>&1",
    "CH_down": "luna-send -f -n 1 luna://com.lge.inputgenerator/pushKeyEvent '{ \"eventtype\": \"key\", \"keycodenum\": 403}' > /dev/null 2>&1",
    "Mute": "luna-send -f -n 1 luna://com.lge.inputgenerator/pushKeyEvent '{ \"eventtype\": \"key\", \"keycodenum\": 113}' > /dev/null 2>&1",
    "InStart": "luna-send -n 1 palm://com.webos.applicationManager/launch '{\"id\":\"com.webos.app.factorywin\", \"params\":{\"irKey\":\"inStart\"}}' > /dev/null 2>&1",
    "1": "luna-send -f -n 1 luna://com.lge.inputgenerator/pushKeyEvent '{ \"eventtype\": \"key\", \"keycodenum\": 2}' > /dev/null 2>&1",
    "2": "luna-send -f -n 1 luna://com.lge.inputgenerator/pushKeyEvent '{ \"eventtype\": \"key\", \"keycodenum\": 3}' > /dev/null 2>&1",
    "3": "luna-send -f -n 1 luna://com.lge.inputgenerator/pushKeyEvent '{ \"eventtype\": \"key\", \"keycodenum\": 4}' > /dev/null 2>&1",
    "4": "luna-send -f -n 1 luna://com.lge.inputgenerator/pushKeyEvent '{ \"eventtype\": \"key\", \"keycodenum\": 5}' > /dev/null 2>&1",
    "5": "luna-send -f -n 1 luna://com.lge.inputgenerator/pushKeyEvent '{ \"eventtype\": \"key\", \"keycodenum\": 6}' > /dev/null 2>&1",
    "6": "luna-send -f -n 1 luna://com.lge.inputgenerator/pushKeyEvent '{ \"eventtype\": \"key\", \"keycodenum\": 7}' > /dev/null 2>&1",
    "7": "luna-send -f -n 1 luna://com.lge.inputgenerator/pushKeyEvent '{ \"eventtype\": \"key\", \"keycodenum\": 8}' > /dev/null 2>&1",
    "8": "luna-send -f -n 1 luna://com.lge.inputgenerator/pushKeyEvent '{ \"eventtype\": \"key\", \"keycodenum\": 9}' > /dev/null 2>&1",
    "9": "luna-send -f -n 1 luna://com.lge.inputgenerator/pushKeyEvent '{ \"eventtype\": \"key\", \"keycodenum\": 10}' > /dev/null 2>&1",
    "0": "luna-send -f -n 1 luna://com.lge.inputgenerator/pushKeyEvent '{ \"eventtype\": \"key\", \"keycodenum\": 11}' > /dev/null 2>&1",
}

# =========================
# SIGNAL HANDLER (MUST EXIST BEFORE main)
# =========================
def signalHandler(signum, frame):
    global stopServer
    with stop_lock:
        stopServer = True

# =========================
# UTIL FUNCTIONS
# =========================
def sendAll(sock, data: bytes) -> bool:
    total = 0
    length = len(data)
    try:
        while total < length:
            sent = sock.send(data[total:])
            if sent == 0:
                return False
            total += sent
        return True
    except (BrokenPipeError, ConnectionResetError):
        return False
    except OSError:
        return False


def createServer(port: int):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.bind(("", port))
    s.listen(5)
    return s


def runCapture() -> bool:
    if not CAPTURE_CMD:
        return False
    try:
        ret = subprocess.call(
            CAPTURE_CMD,
            shell=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        return ret == 0
    except:
        return False

# =========================
# IMAGE SERVER THREAD
# =========================
def imageServer():
    global stopServer

    server = createServer(IMAGE_PORT)
    print(f"[INFO] Image server listening on {IMAGE_PORT}")

    while True:
        with stop_lock:
            if stopServer:
                break

        try:
            client, _ = server.accept()
        except:
            continue

        print("[INFO] Image client connected")

        client.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)

        while True:
            with stop_lock:
                if stopServer:
                    break


            if not sz or not mode_type or not CAPTURE_CMD:
                time.sleep(0.05)
                continue


            if not runCapture():
                continue

            try:
                with open(IMAGE_FILE, "rb") as f:
                    data = f.read()
            except:
                continue

            size = len(data)
            size_net = struct.pack("!I", size)  # big-endian (htonl)

            if not sendAll(client, size_net):
                break
            if not sendAll(client, data):
                break

            time.sleep(0.033)  # ~30 FPS

        client.close()

    server.close()

# =========================
# COMMAND SERVER THREAD
# =========================
def commandServer():
    global sz, mode_type, CAPTURE_CMD, stopServer
    global is_connected, active_connections

    server = createServer(CMD_PORT)
    print(f"[INFO] Command server listening on {CMD_PORT}")

    while True:
        with stop_lock:
            if stopServer:
                break

        try:
            client, _ = server.accept()
        except:
            continue

        print("[INFO] Command client connected")

        acc = ""

        while True:
            with stop_lock:
                if stopServer:
                    break

            try:
                data = client.recv(1024)
                if not data:
                    break
            except:
                break

            acc += data.decode(errors="ignore")

            while "\n" in acc:
                line, acc = acc.split("\n", 1)
                cmd = line.strip()

                if cmd in cmdMap:
                    subprocess.call(cmdMap[cmd], shell=True)
                    client.sendall(b"Btn cmd run successfully...\n")
                    continue

                if cmd.startswith("sz"):
                    # Check if already connected
                    with is_connected_lock:
                        if is_connected:
                            print("[INFO] Only one connection at a time")
                            client.sendall(b"ERROR: Only one connection at a time\n")
                            break

                        tokens = cmd.split()
                        if len(tokens) < 3:
                            print("[ERROR] Invalid sz command:", cmd)
                            client.sendall(b"ERROR: Invalid sz command\n")
                            break

                        sz = resolutionMap.get(tokens[1], "")
                        mode_type = modeMap.get(tokens[2], "")

                        if not sz or not mode_type:
                            print("[ERROR] Invalid resolution or mode:", cmd)
                            client.sendall(b"ERROR: Invalid resolution or mode\n")
                            break

                        CAPTURE_CMD = (
                            "luna-send -n 1 luna://com.webos.service.capture/executeOneShot "
                            "'{\"path\":\"/var/screencapture.jpg\","
                            + mode_type
                            + sz
                            + ",\"format\":\"JPEG\"}' > /dev/null 2>&1"
                        )
                        print(f"[INFO] Configuration updated: {cmd}")
                        client.sendall(b"Configuration updated successfully\n")
                        continue

                if cmd == "disconnect":
                    print("[INFO] Client requested disconnect")
                    with is_connected_lock:
                        is_connected = False

                    #global sz, mode_type, CAPTURE_CMD
                    sz = ""
                    mode_type = ""
                    CAPTURE_CMD = ""

                    client.sendall(b"Disconnecting...\n")
                    break

                if cmd == "status":
                    with is_connected_lock:
                        status_info = {
                            "resolution": sz,
                            "mode": mode_type,
                            "capture_cmd": CAPTURE_CMD,
                            "is_connected": is_connected,
                            "active_connections": active_connections
                        }
                    status_json = json.dumps(status_info)
                    client.sendall((status_json + "\n").encode())
                    continue

                else:
                    print("[ERROR] Unknown command:", cmd)
                    client.sendall(b"ERROR: Unknown command\n")

        client.close()
        print("[INFO] Command client disconnected")

    server.close()
    print("[INFO] Command server stopped")

# =========================
# MAIN
# =========================
def main():
    # Write startup log (same as C++)
    try:
        with open("/mnt/lg/cmn_data/push_s", "a+") as f:
            f.write("\n[INFO] Server started")
    except:
        pass

    signal.signal(signal.SIGINT, signalHandler)
    signal.signal(signal.SIGTERM, signalHandler)

    t1 = threading.Thread(target=imageServer)
    t2 = threading.Thread(target=commandServer)

    t1.start()
    t2.start()

    t1.join()
    t2.join()

# =========================
# ENTRY POINT
# =========================
if __name__ == "__main__":
    main()
