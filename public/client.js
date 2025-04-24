const socket = io('http://26.92.20.182:3333');

const videoPlayer = document.getElementById('videoPlayer');
const roomSelectionDiv = document.getElementById('roomSelection');
const videoContainerDiv = document.getElementById('videoContainer');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const roomNameInput = document.getElementById('roomName');
const videoUrlInput = document.getElementById('videoUrl');
const roomInfoP = document.getElementById('roomInfo');

let currentRoom = null;
let isSeeking = false; 
let userTriggered = true; 

joinRoomBtn.addEventListener('click', () => {
    const room = roomNameInput.value.trim();
    const videoUrl = videoUrlInput.value.trim();

    if (room && videoUrl) {
        currentRoom = room;
        videoPlayer.src = videoUrl; 

        roomSelectionDiv.style.display = 'none';
        videoContainerDiv.style.display = 'block';
        roomInfoP.textContent = `Đang ở trong phòng: ${currentRoom}`;

        socket.emit('joinRoom', currentRoom);

        setTimeout(() => {
             socket.emit('requestSync', { room: currentRoom });
        }, 1000); 

    } else {
        alert('Vui lòng nhập tên phòng và URL video hợp lệ.');
    }
});


videoPlayer.addEventListener('play', () => {
    if (!userTriggered) return; 
    console.log('Bạn đã nhấn Play');
    const currentTime = videoPlayer.currentTime;
    socket.emit('play', { room: currentRoom, time: currentTime });
});

videoPlayer.addEventListener('pause', () => {
    if (!isSeeking && userTriggered) {
        console.log('Bạn đã nhấn Pause');
        const currentTime = videoPlayer.currentTime;
        socket.emit('pause', { room: currentRoom, time: currentTime });
    }
});

videoPlayer.addEventListener('seeking', () => {
    if (!userTriggered) return;
    isSeeking = true;
    console.log('Bạn đang tua video...');
});

videoPlayer.addEventListener('seeked', () => {
    if (!userTriggered) return;
    isSeeking = false;
    const currentTime = videoPlayer.currentTime;
    console.log('Bạn đã tua xong đến:', currentTime);
    socket.emit('seek', { room: currentRoom, time: currentTime });
});

socket.on('connect', () => {
    console.log('Đã kết nối tới server Socket.IO:', socket.id);
});

socket.on('disconnect', () => {
    console.log('Đã mất kết nối tới server Socket.IO');
    alert('Mất kết nối tới server!');
    roomSelectionDiv.style.display = 'block';
    videoContainerDiv.style.display = 'none';
    currentRoom = null;
});

socket.on('userJoined', (userId) => {
    console.log(`Người dùng mới (${userId}) đã tham gia phòng.`);
});


socket.on('play', (time) => {
    console.log('Nhận lệnh Play từ server tại:', time);
    userTriggered = false; 
    videoPlayer.currentTime = time; 
    videoPlayer.play();
    userTriggered = true; 
});

socket.on('pause', (time) => {
    console.log('Nhận lệnh Pause từ server tại:', time);
    userTriggered = false; 
    videoPlayer.pause();
    videoPlayer.currentTime = time; 
    userTriggered = true;
});

socket.on('seek', (time) => {
    console.log('Nhận lệnh Seek từ server đến:', time);
    userTriggered = false;
    isSeeking = true; 
    videoPlayer.currentTime = time;
    isSeeking = false; 
    userTriggered = true; 
});

socket.on('getSyncState', (data) => {
    console.log(`Server yêu cầu trạng thái cho ${data.requesterId}`);
    socket.emit('sendSyncState', {
        requesterId: data.requesterId,
        room: data.room,
        time: videoPlayer.currentTime,
        paused: videoPlayer.paused
    });
});

socket.on('syncState', (data) => {
    console.log('Nhận trạng thái đồng bộ:', data);
    userTriggered = false; 
    isSeeking = true; 
    videoPlayer.currentTime = data.time;
    if (data.paused) {
        videoPlayer.pause();
    } else {
        videoPlayer.addEventListener('seeked', () => {
             if (!data.paused && !userTriggered) { 
                 videoPlayer.play();
                 userTriggered = true;
                 isSeeking = false; 
             }
        }, { once: true }); 
    }
     if (data.paused) {
         userTriggered = true;
         isSeeking = false;
     }
});