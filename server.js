import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import serverConfig from "./serverConfig.json" with { type: 'json' }
import {
    scanMoviesName,
    scanMoviesFile,
    prepareMovieStream,
} from './services/movie.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
    },
});

const MOVIE_BE_PORT = serverConfig.MOVIE_BE_PORT || 3333;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/movies', async (req, res) => {
    try {
        const moviesName = await scanMoviesName();
        res.json(moviesName);
    } catch (err) {
        console.error(err.message);
        res.status(500).send(`Well so NO movie for you, ${err.message}`);
    }
});

// I know this shit isn't optimized, just in case you have a few movies, not tons of movies on your PC
app.get('/movies-files/:movieName', async (req, res) => {
    try {
        const { movieName } = req.params;
        const movieFiles = await scanMoviesFile(movieName);
        res.json(movieFiles);
    } catch (err) {
        console.error(err.message);
        res.status(500).send(
            `MEN my disk is burnt because someone call to much this fucking endpoint, ${err.message}`
        );
    }
});

app.get('/stream/:folder/:filename', async (req, res) => {
    try {
        const folderName = decodeURIComponent(req.params.folder);
        const fileName = decodeURIComponent(req.params.filename);

        const filePath = path.join(
            serverConfig.MOVIE_FOLDER,
            folderName,
            fileName
        );

        const rangeHeader = req.headers.range;

        const result = await prepareMovieStream(filePath, rangeHeader);

        if (result.errorMessage) {
            console.error(result.errorMessage);
            res.status(result.statusCode).send(result.errorMessage);
            return; 
        }

        res.writeHead(result.statusCode, result.head); 

        result.stream.pipe(res);

        result.stream.on('error', (streamErr) => {
            console.error(streamErr.message);
            // Nếu kết nối chưa đóng thì đóng
            if (!res.writableEnded) {
                res.end();
            }
        });
    } catch (error) {
        console.error(error.message);
        if (!res.headersSent) {
            res.status(500).send(`hmmmmmm i have no idea, ${error.message}`);
        } else {
            res.end(); 
        }
    }
});

io.on('connection', (socket) => {
    console.log('Một user mới đã kết nối:', socket.id);

    socket.on('joinRoom', (room) => {
        socket.join(room);
        console.log(`User ${socket.id} đã tham gia phòng ${room}`);
        socket.to(room).emit('userJoined', socket.id);
    });

    socket.on('play', (data) => {
        //console.log(`Phòng ${data.room}: Phát phim tại thời điểm ${data.time}`);
        socket.to(data.room).emit('play', data.time);
    });

    socket.on('pause', (data) => {
        //console.log(`Phòng ${data.room}: Dừng phim tại thời điểm ${data.time}`);
        socket.to(data.room).emit('pause', data.time);
    });

    socket.on('seek', (data) => {
        //console.log(`Phòng ${data.room}: Tua video đến thời điểm ${data.time}`);
        socket.to(data.room).emit('seek', data.time);
    });

    socket.on('requestSync', (data) => {
        console.log(
            `User ${socket.id} request đồng bộ phim phòng ${data.room}`
        );
        const clientsInRoom = io.sockets.adapter.rooms.get(data.room);
        if (clientsInRoom && clientsInRoom.size > 1) {
            const otherClient = Array.from(clientsInRoom).find(
                (clientId) => clientId !== socket.id
            );
            if (otherClient) {
                console.log(
                    `Request trạng thái phim từ user ${otherClient} cho phòng ${data.room}`
                );
                io.to(otherClient).emit('getSyncState', {
                    requesterId: socket.id,
                    room: data.room,
                });
            }
        } else {
            console.log(`Phòng ${data.room} không có ai để đồng bộ.`);
        }
    });

    socket.on('sendSyncState', (data) => {
        console.log(
            `Nhận trạng thái từ user ${socket.id} cho user ${data.requesterId} phòng ${data.room}: time=${data.time}, paused=${data.paused}`
        );
        io.to(data.requesterId).emit('syncState', {
            time: data.time,
            paused: data.paused,
        });
    });

    socket.on('currentTimeUpdate', (data) => {
        socket.to(data.room).emit('remoteTimeUpdate', {
            senderId: socket.id,
            time: data.time,
        });
    });

    socket.on('disconnecting', () => {
        socket.rooms.forEach((room) => {
            if (room !== socket.id) {
                socket.to(room).emit('userLeft', socket.id);
                console.log(`User ${socket.id} rời phòng ${room}`);
            }
        });
    });
});

server.listen(MOVIE_BE_PORT, () => {
    console.log(`Server running at http://localhost:${MOVIE_BE_PORT}`);
});
