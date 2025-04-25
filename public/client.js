const socket = io("http://26.92.20.182:3333");
const videoPlayer = document.getElementById("videoPlayer");
const roomSelectionDiv = document.getElementById("roomSelection");
const videoContainerDiv = document.getElementById("videoContainer");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const roomNameInput = document.getElementById("roomName");
const videoUrlInput = document.getElementById("videoUrl");
const videoInputFile = document.getElementById('videoInput');
const roomInfoP = document.getElementById("roomInfo");
const otherUserTimesListDiv = document.getElementById("otherUserTimesList");

function formatTime(totalSeconds) {
  if (isNaN(totalSeconds) || totalSeconds < 0) {
    return "00:00";
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
    2,
    "0"
  )}`;
}

let currentRoom = null;
let isSeeking = false;
let isNotInAction = true;
let timeUpdateInterval = null;
let fileURL = '';
const userTimeElements = {};

videoInputFile.addEventListener('change', function(event) {
  const fileLocal = event.target.files[0];
  if (fileLocal) {
    fileURL = URL.createObjectURL(fileLocal);
  }
});

joinRoomBtn.addEventListener("click", () => {
  const room = roomNameInput.value.trim();
  fileURL = fileURL || videoUrlInput.value.trim(); 

  if (room && fileURL) {
    currentRoom = room;
    videoPlayer.src = fileURL;

    roomSelectionDiv.style.display = "none";
    videoContainerDiv.style.display = "block";
    roomInfoP.textContent = `Bạn đang ở Room: ${currentRoom}`;

    socket.emit("joinRoom", currentRoom);

    setTimeout(() => {
      socket.emit("requestSync", { room: currentRoom });
    }, 1000);

    if (timeUpdateInterval) {
      clearInterval(timeUpdateInterval);
    }

    timeUpdateInterval = setInterval(() => {
      if (currentRoom && videoPlayer.readyState > 0 && !videoPlayer.seeking) {
        const currentTime = videoPlayer.currentTime;
        socket.emit("currentTimeUpdate", {
          room: currentRoom,
          time: currentTime,
        });
      }
    }, 2000);
  } else {
    alert("Vui lòng nhập tên phòng và URL phim hợp lệ.");
  }
});

videoPlayer.addEventListener("play", () => {
  if (isNotInAction) {
    const currentTime = videoPlayer.currentTime;
    socket.emit("play", { room: currentRoom, time: currentTime });
    console.log("Emit event Play");
  }
});

videoPlayer.addEventListener("pause", () => {
  if (!isSeeking && isNotInAction) {
    const currentTime = videoPlayer.currentTime;
    socket.emit("pause", { room: currentRoom, time: currentTime });
    console.log("Emit event Pause");
  }
});

videoPlayer.addEventListener("seeking", () => {
  if (isNotInAction) {
    isSeeking = true;
    console.log("Đang tua video...");
  }
});

videoPlayer.addEventListener("seeked", () => {
  if (isNotInAction) {
    const currentTime = videoPlayer.currentTime;
    socket.emit("seek", { room: currentRoom, time: currentTime });
    console.log(`Bạn đã tua xong đến ${currentTime}, emit event seek`);
  }
  isSeeking = false;
});

socket.on("connect", () => {
  console.log("Đã kết nối tới server Socket.IO:", socket.id);
});

socket.on("disconnect", () => {
  alert("Mất kết nối tới server!");
  roomSelectionDiv.style.display = "block";
  videoContainerDiv.style.display = "none";
  currentRoom = null;
  isSeeking = false;
  isNotInAction = true;
});

socket.on("userJoined", (userId) => {
  console.log(`User với ID (${userId}) đã tham gia phòng.`);
  if (!userTimeElements[userId] && otherUserTimesListDiv) {
    const elementId = `user-time-${userId}`;
    const userElement = document.createElement("p");
    userElement.id = elementId;
    userElement.textContent = `User ${userId.substring(0, 4)} at time: --:--`;
    otherUserTimesListDiv.appendChild(userElement);
    userTimeElements[userId] = userElement;
  }
});

socket.on("play", (time) => {
  isNotInAction = false;
  videoPlayer.currentTime = time;
  videoPlayer.play();
  isNotInAction = true;
  console.log("Nhận Event Play từ server tại thời điểm:", time);
});

socket.on("pause", (time) => {
  isNotInAction = false;
  videoPlayer.pause();
  videoPlayer.currentTime = time;
  isNotInAction = true;
  console.log("Nhận Event Pause từ server tại thời điểm:", time);
});

socket.on("seek", (time) => {
  if (Math.abs(videoPlayer.currentTime - time) < 0.5) {
    console.log("ESCAPE FROM TARLOOP");
    return;
  }
  isNotInAction = false;
  isSeeking = true;
  videoPlayer.currentTime = time;
  isNotInAction = true;
  console.log("Nhận Event Seek từ server đến thời điểm:", time);
});

socket.on("getSyncState", (data) => {
  console.log(
    `Server đã chọn máy bạn để yêu cầu trạng thái cho user ${data.requesterId}`
  );
  socket.emit("sendSyncState", {
    requesterId: data.requesterId,
    room: data.room,
    time: videoPlayer.currentTime,
    paused: videoPlayer.paused,
  });
});

socket.on("syncState", (data) => {
  isNotInAction = false;
  isSeeking = true;
  videoPlayer.currentTime = data.time;
  if (data.paused) {
    videoPlayer.pause();
    isNotInAction = true;
    isSeeking = false;
  } else {
    videoPlayer.play();
  }
  console.log("Nhận trạng thái từ server để đồng bộ phim:", data);
});

socket.on("remoteTimeUpdate", (data) => {
  const { senderId, time } = data;
  const formattedTime = formatTime(time);
  const elementId = `user-time-${senderId}`;

  let userElement = userTimeElements[senderId];

  if (!userElement && otherUserTimesListDiv) {
    userElement = document.getElementById(elementId);
    if (!userElement) {
      userElement = document.createElement("p");
      userElement.id = elementId;
      otherUserTimesListDiv.appendChild(userElement);
      userTimeElements[senderId] = userElement;
    } else {
      userTimeElements[senderId] = userElement;
    }
  }

  if (userElement) {
    userElement.textContent = `User id ${senderId.substring(
      0,
      4
    )} at time: ${formattedTime}`;
  }
});

socket.on("userLeft", (userId) => {
  console.log(`User với ID (${userId}) đã rời phòng.`);
  const elementId = `user-time-${userId}`;
  const userElement = userTimeElements[userId];

  if (userElement) {
    userElement.remove();
    delete userTimeElements[userId];
  } else {
    const elementOnDom = document.getElementById(elementId);
    if (elementOnDom) {
      elementOnDom.remove();
    }
  }
});
