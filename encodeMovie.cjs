const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');

// --- CONFIG ---
const INPUT_FOLDER = 'D:\\Download\\Stranger.Things.S03.COMPLETE.1080p.NF.WEB-DL.DDP5.1.x264-NTG[TGx]';     // Đường dẫn đến thư mục chứa video gốc
const OUTPUT_FOLDER = 'D:\\Movies\\StrangerThingS3'; // Đường dẫn đến thư mục lưu video đã convert
const VIDEO_EXTENSIONS = ['.mkv', '.mp4', '.avi', '.mov', '.ts', '.wmv', '.flv']; // Thêm đuôi file video nếu cần
const FFMPEG_PATH = 'ffmpeg';           // Giả sử ffmpeg có trong PATH hệ thống, hoặc điền đường dẫn đầy đủ
const FFPROBE_PATH = 'ffprobe';         // Giả sử ffprobe có trong PATH hệ thống, hoặc điền đường dẫn đầy đủ

// --- Cài đặt chuyển mã (Điều chỉnh nếu cần) ---
// Chọn bộ mã hóa GPU: 'h264_nvenc' (NVIDIA), 'h264_qsv' (Intel), 'h264_amf' (AMD)
const GPU_ENCODER = 'h264_nvenc';
// Preset chất lượng/tốc độ: 'p1' (nhanh nhất) -> 'p7' (chậm nhất, chất lượng cao nhất) cho NVENC/QSV.
// 'speed', 'balanced', 'quality' cho AMF. 'p5' hoặc 'medium' là lựa chọn cân bằng tốt.
const QUALITY_PRESET = 'p5';
// Giá trị chất lượng không đổi (Constant Quality): Thấp hơn = chất lượng cao hơn, file lớn hơn. 18-23 là phổ biến.
// 20 là mức chất lượng khá cao.
const QUALITY_VALUE = '20';
const AUDIO_CODEC = 'aac';
const AUDIO_BITRATE = '192k'; // Chất lượng âm thanh tốt cho stereo
const PIXEL_FORMAT = 'yuv420p'; // Định dạng pixel tương thích web tốt nhất
// --- Kết thúc CONFIG ---

/**
 * Tìm chỉ số (index) của luồng phụ đề tiếng Việt đầu tiên trong file.
 * @param {string} filePath Đường dẫn đến file video.
 * @returns {Promise<string|null>} Chỉ số dưới dạng chuỗi, hoặc null nếu không tìm thấy.
 */
async function findVietnameseSubtitleIndex(filePath) {
    console.log(`🔍 Đang tìm phụ đề tiếng Việt cho: ${path.basename(filePath)}`);
    return new Promise((resolve, reject) => {
        // Sử dụng -show_streams để lấy thông tin chi tiết từng luồng
        const ffprobe = spawn(FFPROBE_PATH, [
            '-v', 'error',           // Chỉ hiện lỗi
            '-show_streams',         // Hiển thị thông tin luồng
            '-select_streams', 's', // Chỉ chọn luồng phụ đề (stream type 's')
            filePath
        ]);

        let output = '';
        let errorOutput = '';

        // ffprobe thường xuất thông tin luồng ra stdout khi dùng -show_streams
        ffprobe.stdout.on('data', (data) => {
            output += data.toString();
        });

        ffprobe.stderr.on('data', (data) => {
            errorOutput += data.toString(); // Ghi lại lỗi từ stderr
        });

        ffprobe.on('close', (code) => {
            if (code !== 0) {
                console.error(`ffprobe gặp lỗi (code: ${code}) khi xử lý ${path.basename(filePath)}.`);
                if (errorOutput) console.error("Lỗi ffprobe:", errorOutput);
            }

            if (!output) {
                console.log(`   -> Không tìm thấy luồng phụ đề nào.`);
                return resolve(null); // Không có thông tin luồng phụ đề
            }

            // Phân tích output để tìm luồng tiếng Việt
            // Output có dạng [STREAM] index=N ... TAG:language=vie ... [/STREAM]
            const streams = output.split(/\[\/?STREAM\]/); // Tách các khối [STREAM]...[/STREAM]
            let foundIndex = null;
            for (const streamInfo of streams) {
                if (streamInfo.trim() === '') continue; // Bỏ qua các phần tử rỗng

                const isSubtitle = streamInfo.includes('codec_type=subtitle');
                if (!isSubtitle) continue;

                const indexMatch = streamInfo.match(/index=(\d+)/);
                // Ưu tiên tìm tag ngôn ngữ 'vie'
                const langMatch = streamInfo.match(/TAG:language=vie/i);
                // Nếu không có tag ngôn ngữ, thử tìm trong tiêu đề (ít chuẩn hơn)
                const titleMatch = streamInfo.match(/TAG:title=.*vietnamese/i);

                if (indexMatch && (langMatch || titleMatch)) {
                    foundIndex = indexMatch[1] - 2;
                    console.log(`   -> Tìm thấy phụ đề tiếng Việt tại index: ${foundIndex}`);
                    break; // Lấy luồng tiếng Việt đầu tiên tìm thấy
                }
            }

            if (foundIndex === null) {
                 console.log(`   -> Không tìm thấy luồng phụ đề tiếng Việt cụ thể.`);
            }
            resolve(foundIndex);
        });

        ffprobe.on('error', (err) => {
            console.error(`Không thể khởi động ffprobe cho ${path.basename(filePath)}:`, err);
            reject(new Error(`Lỗi khi chạy ffprobe: ${err.message}`));
        });
    });
}

/**
 * Chuyển đổi video bằng ffmpeg.
 * @param {string} inputFile Đường dẫn file video vào.
 * @param {string} outputFile Đường dẫn file video ra.
 * @param {string|null} subtitleIndex Chỉ số luồng phụ đề để in chìm, hoặc null.
 * @returns {Promise<void>} Resolve khi thành công, reject khi thất bại.
 */
async function convertVideo(inputFile, outputFile, subtitleIndex) {
    return new Promise((resolve, reject) => {
        const args = [
            '-hide_banner',    // Ẩn thông tin banner của ffmpeg
            '-loglevel', 'warning', // Chỉ hiển thị cảnh báo và lỗi
            '-i', inputFile,
            '-c:v', GPU_ENCODER,
            '-preset', QUALITY_PRESET,
        ];

        // Thêm tùy chọn chất lượng phù hợp với bộ mã hóa
        // NVENC/QSV thường dùng -cq
        args.push('-cq', QUALITY_VALUE);
        // AMF thường dùng -qp và cần -rc cqp (Rate Control: Constant Quality Parameter)
        // if (GPU_ENCODER === 'h264_amf') {
        //     args.push('-rc', 'cqp', '-qp', QUALITY_VALUE);
        // } else {
        //     args.push('-cq', QUALITY_VALUE);
        // }

        // Thêm bộ lọc in chìm phụ đề nếu có chỉ số
        if (subtitleIndex !== null) {
            // Cần escape ký tự đặc biệt trong đường dẫn file cho bộ lọc -vf
            // Cách đơn giản nhất là dùng dấu nháy đơn nếu đường dẫn không chứa nháy đơn.
            // Cách an toàn hơn là escape:
            const escapedInputFile = inputFile.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "'\\''");
             args.push('-vf', `subtitles='${escapedInputFile}':si=${subtitleIndex}`);
            console.log(`   Thêm bộ lọc phụ đề: -vf subtitles='...':si=${subtitleIndex}`);
        } else {
            console.log(`   Không in chìm phụ đề.`);
        }

        // Thêm các tùy chọn còn lại
        args.push(
            '-c:a', AUDIO_CODEC,
            '-ac', '2', // Downmix âm thanh thành Stereo
            '-b:a', AUDIO_BITRATE,
            '-pix_fmt', PIXEL_FORMAT,
            '-y', // Tự động ghi đè file đầu ra nếu đã tồn tại
            outputFile
        );

        console.log(`🚀 Bắt đầu chuyển đổi: ${path.basename(inputFile)} -> ${path.basename(outputFile)}`);
        console.log(`Lệnh ffmpeg: ${FFMPEG_PATH} ${args.map(arg => arg.includes(' ') ? `"${arg}"` : arg).join(' ')}`); // Log lệnh đầy đủ 

        const ffmpeg = spawn(FFMPEG_PATH, args);

        let ffmpegOutput = '';
        // ffmpeg thường ghi log tiến trình vào stderr
        ffmpeg.stderr.on('data', (data) => {
            const outputStr = data.toString();
            ffmpegOutput += outputStr;
            // Có thể log tiến trình trực tiếp nhưng sẽ rất nhiều dòng
            // process.stdout.write('.'); // In dấu chấm để thấy tiến trình
        });

        ffmpeg.on('close', (code) => {
             // process.stdout.write('\n'); // Xuống dòng sau khi xong
             if (code === 0) {
                console.log(`✅ Chuyển đổi thành công: ${path.basename(outputFile)}`);
                resolve();
            } else {
                console.error(`❌ Chuyển đổi thất bại (code: ${code}) cho: ${path.basename(inputFile)}`);
                console.error('--- Log từ ffmpeg ---');
                console.error(ffmpegOutput); 
                console.error('--- Kết thúc log ffmpeg ---');
                reject(new Error(`ffmpeg thoát với mã lỗi ${code}`));
            }
        });

        ffmpeg.on('error', (err) => {
            console.error(`Không thể khởi động ffmpeg cho ${path.basename(inputFile)}:`, err);
            reject(new Error(`Lỗi khi chạy ffmpeg: ${err.message}`));
        });
    });
}

/**
 * Hàm chính xử lý toàn bộ thư mục.
 */
async function processFolder() {
    console.log("--- Bắt đầu quá trình chuyển đổi video ---");
    try {
        // 1. Đảm bảo thư mục đầu ra tồn tại
        await fs.mkdir(OUTPUT_FOLDER, { recursive: true });
        console.log(`Đã đảm bảo thư mục đầu ra: ${path.resolve(OUTPUT_FOLDER)}`);
        console.log(`Đọc video từ thư mục: ${path.resolve(INPUT_FOLDER)}`);

        // 2. Đọc danh sách file trong thư mục đầu vào
        const allItems = await fs.readdir(INPUT_FOLDER);

        // 3. Lọc ra các file video dựa trên phần mở rộng
        const videoFiles = allItems.filter(file => {
            const ext = path.extname(file).toLowerCase();
            return VIDEO_EXTENSIONS.includes(ext);
        });

        console.log(`Tìm thấy ${videoFiles.length} file video để xử lý: ${videoFiles.join(', ')}`);

        if (videoFiles.length === 0) {
            console.log("Không tìm thấy file video nào trong thư mục đầu vào.");
            return;
        }

        // 4. Xử lý từng file video một cách tuần tự
        let successCount = 0;
        let failureCount = 0;
        for (let i = 0; i < videoFiles.length; i++) {
            const fileName = videoFiles[i];
            const inputFilePath = path.join(INPUT_FOLDER, fileName);
            const outputFileName = `${path.basename(fileName, path.extname(fileName))}_web.mp4`;
            const outputFilePath = path.join(OUTPUT_FOLDER, outputFileName);

            console.log(`\n--- (${i + 1}/${videoFiles.length}) Bắt đầu xử lý: ${fileName} ---`);

            try {
                // Tùy chọn: Kiểm tra nếu file đích đã tồn tại thì bỏ qua
                /*
                try {
                    await fs.access(outputFilePath);
                    console.log(`   File đích ${outputFileName} đã tồn tại. Bỏ qua.`);
                    continue; // Chuyển sang file tiếp theo
                } catch (error) {
                    // File chưa tồn tại, tiếp tục xử lý
                }
                */

                // 4a. Tìm chỉ số phụ đề tiếng Việt
                const subIndex = await findVietnameseSubtitleIndex(inputFilePath);

                // 4b. Chạy lệnh chuyển đổi ffmpeg
                await convertVideo(inputFilePath, outputFilePath, subIndex);
                successCount++;

            } catch (error) {
                failureCount++;
                console.error(` >> Lỗi nghiêm trọng khi xử lý ${fileName}:`, error.message || error);
                // Script sẽ tiếp tục với file tiếp theo sau khi gặp lỗi
            }
        }

        console.log('\n--- 🔥 Hoàn tất quá trình xử lý! ---');
        console.log(`   Thành công: ${successCount} file`);
        console.log(`   Thất bại:  ${failureCount} file`);

    } catch (error) {
        console.error('💥 Lỗi tổng thể trong quá trình xử lý thư mục:', error);
    }
}

// --- Chạy hàm chính ---
processFolder();
