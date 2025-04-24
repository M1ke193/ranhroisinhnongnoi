import express from 'express';
import http from 'http';
import { Server } from 'socket.io'; 
import path from 'path';
import { fileURLToPath } from 'url'; 

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

const MOVIE_BE_PORT = process.env.MOVIE_BE_PORT || 3333;

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
  console.log('Một người dùng mới đã kết nối:', socket.id);

  socket.on('joinRoom', (room) => {
    socket.join(room);
    console.log(`Người dùng ${socket.id} đã tham gia phòng ${room}`);
    socket.to(room).emit('userJoined', socket.id);
  });

  socket.on('play', (data) => {
    console.log(`Phòng ${data.room}: Phát video tại ${data.time}`);
    socket.to(data.room).emit('play', data.time);
  });

  socket.on('pause', (data) => {
    console.log(`Phòng ${data.room}: Dừng video tại ${data.time}`);
    socket.to(data.room).emit('pause', data.time);
  });

  socket.on('seek', (data) => {
    console.log(`Phòng ${data.room}: Tua video đến ${data.time}`);
    socket.to(data.room).emit('seek', data.time);
  });

  socket.on('requestSync', (data) => {
    console.log(`Người dùng ${socket.id} yêu cầu đồng bộ phòng ${data.room}`);
    const clientsInRoom = io.sockets.adapter.rooms.get(data.room);
    if (clientsInRoom && clientsInRoom.size > 1) {
      const otherClient = Array.from(clientsInRoom).find(clientId => clientId !== socket.id);
      if (otherClient) {
        console.log(`Yêu cầu trạng thái từ ${otherClient} cho phòng ${data.room}`);
        io.to(otherClient).emit('getSyncState', { requesterId: socket.id, room: data.room });
      }
    } else {
         console.log(`Phòng ${data.room} không có ai khác để đồng bộ.`);
    }
  });

  socket.on('sendSyncState', (data) => {
    console.log(`Nhận trạng thái từ ${socket.id} cho ${data.requesterId} phòng ${data.room}: time=${data.time}, paused=${data.paused}`);
    io.to(data.requesterId).emit('syncState', { time: data.time, paused: data.paused });
  });

  socket.on('disconnect', () => {
    console.log('Người dùng đã ngắt kết nối:', socket.id);
  });
});

server.listen(MOVIE_BE_PORT, () => {
  console.log(`Server running at http://localhost:${MOVIE_BE_PORT}`);
});