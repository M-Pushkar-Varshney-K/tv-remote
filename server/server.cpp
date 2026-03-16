#include <iostream>
#include <thread>
#include <vector>
#include <fstream>
#include <unistd.h>
#include <arpa/inet.h>

#define IMAGE_PORT 8080
#define CMD_PORT 9990

const char* IMAGE_FILE = "/home/mpvk/IMG.jpg";
const char* CAPTURE_CMD = "";

void sendImageStream() {

    int server_fd = socket(AF_INET, SOCK_STREAM, 0);

    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(IMAGE_PORT);
    addr.sin_addr.s_addr = INADDR_ANY;

    bind(server_fd,(sockaddr*)&addr,sizeof(addr));
    listen(server_fd,1);

    std::cout<<"Image server waiting...\n";

    int client = accept(server_fd,nullptr,nullptr);

    std::cout<<"Image client connected\n";

    while(true)
    {
        system(CAPTURE_CMD);

        std::ifstream file(IMAGE_FILE,std::ios::binary|std::ios::ate);

        if(!file) continue;

        std::streamsize size = file.tellg();
        file.seekg(0,std::ios::beg);

        std::vector<char> buffer(size);

        file.read(buffer.data(),size);

        uint32_t netSize = htonl(size);

        send(client,&netSize,sizeof(netSize),0);
        send(client,buffer.data(),size,0);

        usleep(33000); // ~30fps
    }
}

void commandServer() {

    int server_fd = socket(AF_INET,SOCK_STREAM,0);

    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(CMD_PORT);
    addr.sin_addr.s_addr = INADDR_ANY;

    bind(server_fd,(sockaddr*)&addr,sizeof(addr));
    listen(server_fd,1);

    std::cout<<"Command server waiting...\n";

    int client = accept(server_fd,nullptr,nullptr);

    std::cout<<"Command client connected\n";

    char buffer[1024];

    while(true)
    {
        int len = recv(client,buffer,1023,0);

        if(len<=0) continue;

        buffer[len]=0;

        system(buffer);
    }
}

int main() {

    std::thread t1(sendImageStream);
    std::thread t2(commandServer);

    t1.join();
    t2.join();

    return 0;
}
