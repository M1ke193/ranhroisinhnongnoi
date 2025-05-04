const serverHost = window.location.href.replace(/\/$/, '');
const socket = io(serverHost);

const bodyElement = document.body;

// Elements cho phần join room
const joinRoomBtn = document.getElementById('joinRoomBtn');
const roomNameInput = document.getElementById('roomName');
const videoUrlInput = document.getElementById('videoUrl');
const videoInputFile = document.getElementById('videoInput');

// Elements cho phần xem phim
const videoPlayer = document.getElementById('videoPlayer');
const roomSelectionDiv = document.getElementById('roomSelection');
const videoContainerDiv = document.getElementById('videoContainer');
const roomInfoP = document.getElementById('roomInfo');
const otherUserTimesListDiv = document.getElementById('otherUserTimesList');

// Elements cho phần duyệt phim server
const movieListEl = document.getElementById('movie-list');
const episodeContainerEl = document.getElementById('episode-container');
const episodeListEl = document.getElementById('episode-list');
const selectedMovieTitleEl = document.getElementById('selected-movie-title');
// Kết thúc Elements cho phần duyệt phim server

// Elements cho phần setting
const settingsButton = document.getElementById('settings-button');
const settingsPopup = document.getElementById('settings-popup');
const darkModeSwitch = document.getElementById('darkmode-switch');
// Kết thúc Elements cho phần setting

function formatTime(totalSeconds) {
    if (isNaN(totalSeconds) || totalSeconds < 0) {
        return '00:00';
    }
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(
        2,
        '0'
    )}`;
}

let currentRoom = null;
let isSeeking = false;
let isNotInAction = true;
let timeUpdateInterval = null;
let fileURL = '';
let userTimeElements = {};
let movies = {};
let currentSelectedEpisodeLi = null;
//this make sure that everyone in the room will be in sync with the new joiner, there will be a flicker (TODO: it can be setting)
let isFirstSync = false;

//event for video button
document.addEventListener('keydown', async function (event) {
    const skipTime = 10;
    switch (event.key) {
        case 's':
            if (isNotInAction) {
                event.preventDefault();
                if (videoPlayer.paused || videoPlayer.ended) {
                    await videoPlayer.play();
                } else {
                    await videoPlayer.pause();
                }
            }
            break;

        case 'a':
            if (isNotInAction) {
                event.preventDefault();
                videoPlayer.currentTime -= skipTime;
                if (videoPlayer.currentTime < 0) {
                    videoPlayer.currentTime = 0;
                }
            }
            break;

        case 'd':
            if (isNotInAction) {
                event.preventDefault();
                videoPlayer.currentTime += skipTime;
                if (videoPlayer.currentTime > videoPlayer.duration) {
                    videoPlayer.currentTime = videoPlayer.duration;
                }
            }
            break;

        case 'm':
            event.preventDefault();
            videoPlayer.muted = !videoPlayer.muted;
            break;

        case 'f':
            event.preventDefault();
            document.fullscreenElement
                ? document.exitFullscreen()
                : videoPlayer.requestFullscreen();
            break;
    }
});

videoInputFile.addEventListener('change', function (event) {
    const fileLocal = event.target.files[0];
    if (fileLocal) {
        fileURL = URL.createObjectURL(fileLocal);
    }
});

joinRoomBtn.addEventListener('click', () => {
    const room = roomNameInput.value.trim();
    fileURL = fileURL || videoUrlInput.value.trim();
    handleJoinRomm(room, fileURL);
});

const handleJoinRomm = (room, streamURL) => {
    if (room && streamURL) {
        if (currentRoom !== room) {
            socket.emit('leaveRoom', currentRoom);
            currentRoom = room;
        }
        videoPlayer.src = streamURL;
        roomSelectionDiv.style.display = 'none';
        videoContainerDiv.style.display = 'block';
        roomInfoP.textContent = `BẠN ĐANG Ở ROOM: ${currentRoom}`;

        socket.emit('joinRoom', currentRoom);

        setTimeout(() => {
            socket.emit('requestSync', { room: currentRoom });
            videoPlayer.focus();
        }, 1000);

        if (timeUpdateInterval) {
            clearInterval(timeUpdateInterval);
        }

        timeUpdateInterval = setInterval(() => {
            if (
                currentRoom &&
                videoPlayer.readyState > 0 &&
                !videoPlayer.seeking
            ) {
                const currentTime = videoPlayer.currentTime;
                socket.emit('currentTimeUpdate', {
                    room: currentRoom,
                    time: currentTime,
                });
            }
        }, 2000);
    } else {
        alert('Tên phòng và URL phim hợp lệ');
    }
};

videoPlayer.addEventListener('play', () => {
    if (isNotInAction || isFirstSync) {
        const currentTime = videoPlayer.currentTime;
        socket.emit('play', { room: currentRoom, time: currentTime });
        console.log('Emit event Play');
    }
});

videoPlayer.addEventListener('pause', () => {
    emitPauseEvent()
});

const emitPauseEvent = () => {
    if (!isSeeking && isNotInAction) {
        const currentTime = videoPlayer.currentTime;
        socket.emit('pause', { room: currentRoom, time: currentTime });
        console.log('Emit event Pause');
    }
};

videoPlayer.addEventListener('seeking', () => {
    if (isNotInAction) {
        isSeeking = true;
        console.log('Đang tua video...');
    }
});

videoPlayer.addEventListener('seeked', () => {
    if (isNotInAction) {
        const currentTime = videoPlayer.currentTime;
        socket.emit('seek', { room: currentRoom, time: currentTime });
        console.log(`Bạn đã tua xong đến ${currentTime}, emit event seek`);
    }
    isSeeking = false;
});

socket.on('connect', () => {
    console.log('Đã kết nối tới server Socket.IO:', socket.id);
});

socket.on('disconnect', () => {
    alert('Mất kết nối tới server!');
    reset();
});

const goBackJoinRoom = () => {
    socket.emit('leaveRoom', currentRoom);
    reset();
};

const reset = () => {
    resetRoom();
    resetVideo();
    resetUserTime();
};

const resetRoom = () => {
    roomSelectionDiv.style.display = 'block';
    videoContainerDiv.style.display = 'none';
    currentRoom = null;
    isSeeking = false;
    isNotInAction = true;
    fileURL = true;
};

const resetUserTime = () => {
    if (timeUpdateInterval) {
        clearInterval(timeUpdateInterval);
        timeUpdateInterval = null;
    }

    for (const key in userTimeElements) {
        const domElement = userTimeElements[key];

        if (domElement) {
            domElement.remove();
        }
        userTimeElements = {};
    }
};

const resetVideo = () => {
    videoPlayer.pause();
    videoPlayer.removeAttribute('src');
    videoPlayer.src = '';
    videoPlayer.load();
};

socket.on('userJoined', (userId) => {
    console.log(`User với ID (${userId}) đã tham gia phòng.`);
    if (!userTimeElements[userId] && otherUserTimesListDiv) {
        const elementId = `user-time-${userId}`;
        const userElement = document.createElement('p');
        userElement.addEventListener('click', emitPauseEvent)
        userElement.id = elementId;
        userElement.textContent = `User ${userId.substring(
            0,
            4
        )} at time: --:--`;
        otherUserTimesListDiv.appendChild(userElement);
        userTimeElements[userId] = userElement;
    }
});

socket.on('play', async (time) => {
    isNotInAction = false;
    videoPlayer.currentTime = time;
    await videoPlayer.play();
    isNotInAction = true;
    console.log('Nhận Event Play từ server tại thời điểm:', time);
});

socket.on('pause', async (time) => {
    isNotInAction = false;
    await videoPlayer.pause();
    videoPlayer.currentTime = time;
    isNotInAction = true;
    console.log('Nhận Event Pause từ server tại thời điểm:', time);
});

socket.on('seek', async (time) => {
    if (Math.abs(videoPlayer.currentTime - time) < 1) {
        console.log('ESCAPE FROM TARLOOP');
        return;
    }
    isNotInAction = false;
    isSeeking = true;
    videoPlayer.currentTime = time;
    isNotInAction = true;
    console.log('Nhận Event Seek từ server đến thời điểm:', time);
});

socket.on('getSyncState', (data) => {
    console.log(
        `Server đã chọn máy bạn để yêu cầu trạng thái cho user ${data.requesterId}`
    );
    socket.emit('sendSyncState', {
        requesterId: data.requesterId,
        room: data.room,
        time: videoPlayer.currentTime,
        paused: videoPlayer.paused,
    });
});

socket.on('syncState', async (data) => {
    isNotInAction = false;
    videoPlayer.currentTime = data.time;
    if (data.paused) {
        await videoPlayer.pause();
    } else {
        isFirstSync = true;
        await videoPlayer.play();
    }
    isNotInAction = true;
    isFirstSync = false;
    console.log('Nhận trạng thái từ server để đồng bộ phim:', data);
});

socket.on('remoteTimeUpdate', (data) => {
    const { senderId, time } = data;
    const formattedTime = formatTime(time);
    const elementId = `user-time-${senderId}`;

    let userElement = userTimeElements[senderId];

    if (!userElement && otherUserTimesListDiv) {
        userElement = document.getElementById(elementId);
        if (!userElement) {
            userElement = document.createElement('p');
            userElement.addEventListener('click', emitPauseEvent)
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

socket.on('userLeft', (userId) => {
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

// Hàm gọi API và nhóm phim
async function fetchMovies() {
    movieListEl.innerHTML = '';

    try {
        const response = await fetch(`${serverHost}/movies`);
        const flatMovieList = await response.json();
        movies = {};
        flatMovieList.forEach((movie) => {
            if (!movies[movie]) {
                movies[movie] = [];
            }
        });
    } catch (error) {
        console.error('Lỗi khi tải danh sách phim:', error);
        movieListEl.innerHTML = `<li>Lỗi tải phim: ${error.message}</li>`;
    }
}

// Hàm xử lý khi nhấp vào tên phim
async function handleMovieTitleClick(event) {
    if (currentSelectedEpisodeLi) {
        currentSelectedEpisodeLi.classList.remove('selected');
        currentSelectedEpisodeLi = null;
    }
    const selectedMovie = event.target.dataset.movieTitle;
    if (movies[selectedMovie].length === 0) {
        try {
            const response = await fetch(
                `${serverHost}/movies-files/${selectedMovie}`
            );
            const episodes = await response.json();
            movies[selectedMovie] = [...episodes];
        } catch (error) {
            console.error('Lỗi khi các tập phim:', error);
            episodeListEl.innerHTML = `<li>Lỗi tải Episodes của phim: ${error.message}</li>`;
        }
    }
    const episodes = movies[selectedMovie];
    selectedMovieTitleEl.textContent = `Episodes ${selectedMovie}`;
    episodeListEl.innerHTML = '';
    if (episodes && episodes.length > 0) {
        episodes.forEach((episode, index) => {
            const li = document.createElement('li');
            li.textContent = episode.file;
            li.dataset.relativeStreamUrl = episode.streamUrl;
            li.dataset.episodeTitle = `${selectedMovie}-${index}`;
            li.addEventListener('click', handleEpisodeClick);
            episodeListEl.appendChild(li);
        });
    } else {
        episodeListEl.innerHTML =
            '<li>Well thằng host server troll à, rồi phim nhét ở đâu vậy ?</li>';
    }
}

// Hàm xử lý khi nhấp vào một tập phim
function handleEpisodeClick(event) {
    const selectedEpisodes = event.target;
    const relativeStreamUrl = selectedEpisodes.dataset.relativeStreamUrl;
    const episodeTitle = selectedEpisodes.dataset.episodeTitle;

    const absoluteStreamUrl = serverHost + relativeStreamUrl;

    if (absoluteStreamUrl !== videoPlayer.src || currentRoom !== episodeTitle) {
        handleJoinRomm(episodeTitle, absoluteStreamUrl);
    }

    window.scrollTo({
        top: 0,
        behavior: 'smooth',
    });

    if (currentSelectedEpisodeLi) {
        currentSelectedEpisodeLi.classList.remove('selected');
    }
    selectedEpisodes.classList.add('selected');
    currentSelectedEpisodeLi = selectedEpisodes;
}

// Hàm hiển thị danh sách tên phim
function displayMovieTitle() {
    movieListEl.innerHTML = '';
    const movieTitles = Object.keys(movies).sort();

    if (movieTitles.length === 0) {
        movieListEl.innerHTML = '<li>Không tìm thấy phim nào trên server</li>';
        return;
    }

    movieTitles.forEach((title) => {
        const li = document.createElement('li');
        li.textContent = title;
        li.dataset.movieTitle = title;
        li.addEventListener('click', handleMovieTitleClick);
        movieListEl.appendChild(li);
    });
}

// Croll xuống thanh Episode đang xem
function crollToEpisode() {
    if (currentSelectedEpisodeLi) {
        currentSelectedEpisodeLi.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
        });
    } else {
        document
            .getElementById('movie-list')
            .scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}
// setting part
function togglePopup() {
    settingsPopup.classList.toggle('show');
}

function applyDarkMode(isDark) {
    if (isDark) {
        bodyElement.classList.add('dark-mode');
    } else {
        bodyElement.classList.remove('dark-mode');
    }
    darkModeSwitch.checked = isDark;
}

function updateToggleStatus() {
    const isDarkModeEnabled = darkModeSwitch.checked;
    applyDarkMode(isDarkModeEnabled);
    try {
        localStorage.setItem('darkMode', isDarkModeEnabled);
    } catch (e) {
        console.error(
            `Không thể lưu thiết lập Dark Mode vào localStorage: ${e.message}`
        );
    }
}

settingsButton.addEventListener('click', function (event) {
    event.stopPropagation();
    togglePopup();
});

document.addEventListener('click', function (event) {
    if (
        settingsPopup.classList.contains('show') &&
        !settingsPopup.contains(event.target) &&
        !settingsButton.contains(event.target)
    ) {
        togglePopup();
    }
});

darkModeSwitch.addEventListener('change', updateToggleStatus);

// === Initialization ===
// Movie
async function initializeMovieBrowser() {
    await fetchMovies();
    displayMovieTitle();
}

//dark mode
async function initializeDarkMode() {
    let savedDarkMode = false;
    try {
        savedDarkMode = localStorage.getItem('darkMode') === 'true';
    } catch (e) {
        console.error(
            `Lỗi Khi đọc thiết lập Dark Mode từ localStorage: ${e.message}`
        );
    }
    applyDarkMode(savedDarkMode);
}

// Initialization khi trang tải xong
document.addEventListener('DOMContentLoaded', () => {
    initializeDarkMode();
    initializeMovieBrowser();
});
