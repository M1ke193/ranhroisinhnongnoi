import fs from 'fs'
import path from 'path';
import serverConfig from "../serverConfig.json" with { type: 'json' }

// some catch log errors here are not security, if you make it public outside the internet, please remove it
export async function scanMoviesName() {
    const movieList = [];
    try {
        const items = await fs.promises.readdir(path.join(serverConfig.MOVIE_FOLDER), {
            withFileTypes: true,
        });

        for (const item of items) {
            if (item.isDirectory()) {
                movieList.push(item.name)
            }
        }
    } catch (err) {
        throw new Error(`Error when scan movie folder ${basePath}: ${err.message}`);
    }
    return movieList;
}

export async function scanMoviesFile(movieName) {
    const movieListFile = [];
    const subFolderPath = path.join(serverConfig.MOVIE_FOLDER, movieName);
    try {
        const files = await fs.promises.readdir(subFolderPath);
        const mp4Files = files.filter(
            (file) => path.extname(file).toLowerCase() === '.mp4'
        );

        for (const mp4File of mp4Files) {
            movieListFile.push({
                movieName: movieName,
                file: mp4File,
                streamUrl: `/stream/${encodeURIComponent(
                    movieName
                )}/${encodeURIComponent(mp4File)}`,
            });
        }
    } catch (err) {
        throw new Error(`Error when read movie folder ${subFolderPath}: ${err.message}`);
    }
    return movieListFile;
}

export async function prepareMovieStream(filePath, rangeHeader) {
    try {
        let stats;
        try {
            stats = await fs.promises.stat(filePath);
        } catch (statErr) {
            if (statErr.code === 'ENOENT') {
                return { stream: null, head: null, statusCode: 404, errorMessage: `Can not find movie` };
            } else {
                return { stream: null, head: null, statusCode: 500, errorMessage: `Hmmm sum thing wrong, ${statErr.message}` };
            }
        }

        // Lấy thông tin kích thước file
        const fileSize = stats.size;

        // --- XỬ LÝ RANGE HEADER ---
        // Kiểm tra header Range từ trình duyệt (để biết có cần stream từng phần không)
        if (rangeHeader) {
            const parts = rangeHeader.replace(/bytes=/, "").split("-"); // "bytes=1000-5000"
            const start = parseInt(parts[0], 10);
            // Nếu không có end đọc đến hết file
            let end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

             // Kiểm tra start 
            if (isNaN(start) || start < 0 || start >= fileSize) {
                 return { stream: null, head: null, statusCode: 416, errorMessage: 'Start range Not Satisfiable' };
             }
             // Điều chỉnh end nếu nó vượt quá kích thước file
             if (end >= fileSize) {
                 end = fileSize - 1;
             }
             // Kiểm tra end 
              if (isNaN(end) || end < start) {
                 return { stream: null, head: null, statusCode: 416, errorMessage: 'End range Not Satisfiable' };
             }

            const chunksize = (end - start) + 1; // Kích thước dữ liệu sẽ gửi
            const fileStream = fs.createReadStream(filePath, { start, end }); //stream đọc file trong phạm vi yêu cầu
            // Tạo các header cho phản hồi 206 Partial Content (server chỉ trả về một phần của file, thay vì toàn bộ file, client cần biết điều này)
            const head = {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': 'video/mp4',
            };
            return { stream: fileStream, head: head, statusCode: 206, errorMessage: null };

        } else {
            // Gửi toàn bộ file
            const head = {
                'Content-Length': fileSize,
                'Content-Type': 'video/mp4',
            };
            const fileStream = fs.createReadStream(filePath);
            return { stream: fileStream, head: head, statusCode: 200, errorMessage: null };
        }

    } catch (error) {
        return { stream: null, head: null, statusCode: 500, errorMessage: `Can not stream file , ${error.message}` };
    }
}
