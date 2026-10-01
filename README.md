# FASHAR — Smart Fitting Studio

FASHAR là demo thử đồ trên trình duyệt: nhận diện một người qua camera, ước lượng số đo từ ảnh chính diện và ảnh nghiêng, gợi ý size từ catalog mẫu, rồi vẽ áo/quần lên người theo chuyển động. Ứng dụng có **chế độ preview không cần camera** để duyệt giao diện và **chế độ live** dùng webcam cùng API Python.

> **Trạng thái:** UI preview và bản build frontend đã chạy được. Cần tiếp tục kiểm thử, hiệu chỉnh sai số đo và độ ổn định AR trên máy có camera thật. Đây là demo chọn size, chưa phải thiết bị đo cơ thể hoặc hệ thống fitting chính xác để mua hàng.

## Tech stack

| Phần | Công nghệ/thư viện | Vai trò |
| --- | --- | --- |
| Frontend | React 19, TypeScript 5, Vite 6 | Giao diện, luồng quét và build web |
| Giao diện | CSS, Lucide React | Theme tối, layout desktop, icon |
| Camera | `getUserMedia`, `enumerateDevices`, Canvas API | Chọn webcam tích hợp/USB, lấy khung hình, hiển thị video |
| AR | Three.js 0.186, WebGL; renderer Canvas/SVG dự phòng | Dựng mesh áo/quần và cập nhật theo pose |
| Backend | Python 3.10+, FastAPI, Uvicorn, Pydantic | API cấu hình, catalog, đo, gợi ý size và WebSocket tracking |
| Computer vision | MediaPipe Pose Landmarker Lite, OpenCV, NumPy | Điểm khớp, mask cơ thể, phát hiện ArUco, tính số đo |
| Dữ liệu mẫu | JSON, asset SVG | 12 sản phẩm áo/quần, bảng size, ảnh preview |

Model MediaPipe là **model pretrained** tải riêng khi cài đặt; project hiện không có bước train model. Nhóm trang phục nam/nữ/unisex do người dùng chọn, không suy đoán giới tính từ camera. Các nhãn dáng như “vai trội”, “hông trội”, “eo rõ” là quy tắc dựa trên tỷ lệ số đo, không phải chẩn đoán thành phần cơ thể.

## Cài đặt và chạy

Yêu cầu: Python **3.10+**, Node.js **20+**, npm, Chrome hoặc Edge. Chạy lệnh từ thư mục gốc repository.

### Chỉ xem và duyệt UI, không cần camera/Python

```bash
cd frontend
npm ci
npm run dev
```

Mở **http://127.0.0.1:5173/?preview=1**. Chế độ này dùng `frontend/public/catalog.json`, số đo mẫu và hình người minh họa. Bạn có thể lọc catalog, đổi size, chọn/bỏ đồ, đổi tư thế **Chính diện / Nghiêng / Quay lưng / Đá chân** và tải ảnh preview. Dữ liệu này không đến từ camera hoặc model AI. [Ảnh chụp UI](docs/ui-preview.png).

### Chạy toàn bộ demo với camera

Cài dependency Python vào thư mục riêng của project, tải model và cài dependency frontend:

```bash
python3 -m pip install -r backend/requirements.txt --target backend/.deps
python3 backend/download_model.py
cd frontend
npm ci
```

Mở hai terminal tại thư mục gốc repository:

```bash
# Terminal 1 — API tại http://127.0.0.1:8000
python3 backend/run.py
```

```bash
# Terminal 2 — web tại http://127.0.0.1:5173
cd frontend
npm run dev
```

Mở **http://127.0.0.1:5173/** và cấp quyền camera. Vite chuyển tiếp cả HTTP `/api` và WebSocket `/api/tracking` đến backend trên cổng 8000. Trình duyệt chỉ cho truy cập camera trên `localhost` hoặc HTTPS. Camera USB phải được hệ điều hành nhận diện là thiết bị video để xuất hiện trong danh sách.

Các asset SVG và `catalog.json` đã có sẵn trong repo. Chỉ chạy `python3 frontend/scripts/create_assets.py` khi muốn tạo lại chúng; script cần OpenCV để tạo marker ArUco. `backend/run.py` tự nạp gói trong `backend/.deps`, nên không bắt buộc tạo virtual environment.

**Windows PowerShell:** thay `python3` bằng `py -3`, dùng đường dẫn `backend\...`, và chạy `npm.cmd ci` / `npm.cmd run dev` nếu PowerShell chặn `npm.ps1`. Ví dụ: `py -3 -m pip install -r backend\requirements.txt --target backend\.deps` rồi `py -3 backend\download_model.py`.

### Build frontend

```bash
cd frontend
npm ci
npm run build
```

Build chạy kiểm tra TypeScript rồi tạo file tĩnh trong `frontend/dist/`. `npm run preview` chỉ xem bản build tĩnh; chế độ `?preview=1` hoạt động độc lập. Để chạy **live** từ bản build đã deploy, web server cần chuyển tiếp cả `/api/*` và WebSocket `/api/tracking` đến backend. `frontend/dist/`, `frontend/node_modules/`, `backend/.deps/` và `backend/models/` nằm trong `.gitignore`.

## Cấu hình buổi quét

Sửa [backend/config.json](backend/config.json) trước khi chạy. Cấu hình mặc định:

```json
{
  "height_cm": 179,
  "measurements_cm": {},
  "capture_seconds": 3,
  "camera": { "orientation": "portrait", "width": 720, "height": 1080 }
}
```

- **`height_cm`** là chiều cao thật dùng để quy đổi pixel sang cm trong luồng UI mặc định. Hãy nhập lại chiều cao của người được quét; có thể sửa trực tiếp trên giao diện trước khi quét. Nếu giá trị này sai, các số đo còn lại cũng sai theo.
- **`capture_seconds`** là số giây cần đứng ổn định trước khi tự chụp; có thể chỉnh từ lớn hơn 0 đến 30 giây.
- **`camera`** đặt hướng và độ phân giải *mong muốn*. Với camera ngang, dùng `"orientation": "landscape", "width": 1080, "height": 720`. Trình duyệt có thể chọn độ phân giải khác nếu thiết bị không hỗ trợ.
- **`measurements_cm`** cho phép ghi đè số đo ước lượng, ví dụ `{"chest": 96, "waist": 80}`. Các khóa hợp lệ: `shoulder`, `chest`, `waist`, `hip`, `hip_width`, `arm_length`, `torso_length`, `outer_leg`, `thigh`. Để `{}` nếu không muốn ghi đè.

### Vì sao cần nhập chiều cao?

Webcam thường cho biết một người cao bao nhiêu **pixel**, nhưng cùng một người sẽ chiếm nhiều pixel hơn khi đứng gần camera. Model trong project xác định vị trí các khớp, còn tọa độ ảnh của chúng không tự cung cấp thang đo cm. Từ một ảnh đơn không có mốc kích thước hoặc thông tin khoảng cách, không thể quy đổi chiều cao tuyệt đối ra cm một cách đáng tin cậy; đây là vấn đề thiếu thang đo của phép chiếu camera. [Tài liệu mô hình camera OpenCV](https://docs.opencv.org/3.4.20/d9/d0c/group__calib3d.html).

Demo dùng **chiều cao thật do người dùng nhập** làm mốc: lấy chiều cao của silhouette trong ảnh chia cho chiều cao đã nhập để tính pixel/cm, rồi áp dụng tỷ lệ đó cho các khoảng cách và bề rộng khác. Giá trị `179 cm` trong config chỉ là **dữ liệu mẫu**; phải thay bằng chiều cao thật trước khi đo. Cách này cho phép chạy với webcam laptop/USB thông thường, không cần mua thiết bị hoặc bắt người dùng in và đặt vật chuẩn. Đổi lại, kết quả phụ thuộc vào chiều cao nhập đúng, thấy trọn đầu–bàn chân, camera đứng yên và người đứng cùng khoảng cách ở hai góc.

Có thể tự xác định chiều cao bằng các cách sau, nhưng mỗi cách cần thêm điều kiện:

| Cách | Cần chuẩn bị | Lưu ý |
| --- | --- | --- |
| **Vật chuẩn / ArUco** có cạnh đã đo | In/đo marker và đặt gần cùng mặt phẳng với người | Quy đổi pixel/cm từ vật chuẩn; phải phát hiện marker rõ ở mỗi ảnh. API đã hỗ trợ `marker_cm`. [OpenCV ArUco](https://docs.opencv.org/3.3.0/d5/dae/tutorial_aruco_detection.html) |
| **Camera được hiệu chuẩn trong vị trí cố định** | Biết thông số camera, khoảng cách/vị trí đứng và mặt sàn | Có thể suy ra kích thước khi điều kiện hình học được kiểm soát; phải hiệu chuẩn lại nếu đổi camera hoặc bố trí. [OpenCV camera calibration](https://docs.opencv.org/3.4.20/d9/d0c/group__calib3d.html) |
| **Camera chiều sâu hoặc stereo** | Phần cứng và SDK cung cấp khoảng cách theo pixel | Có thêm dữ liệu khoảng cách để ước lượng kích thước 3D; tăng yêu cầu thiết bị và hiệu chuẩn. [RealSense depth projection](https://dev.realsenseai.com/docs/projection-in-realsense-sdk-2-0/) |

Vì mục tiêu hiện tại là **demo chạy trên laptop CPU với webcam phổ thông**, nhập chiều cao là lựa chọn ít thao tác và dễ triển khai nhất. Đây vẫn là phép ước lượng; trước khi dùng để chọn size thật cần đo sai số thực nghiệm với thước dây.

Backend đọc lại config ở mỗi request đo. Tải lại trang để frontend nhận thời gian quét/hướng camera mới; nếu camera đang bật, khởi động lại camera. API đo vẫn hỗ trợ **ArUco ID 0** qua `marker_cm` thay cho chiều cao đã biết. Cần in [marker](frontend/public/assets/aruco-marker.svg), đo cạnh hình vuông đen thực tế và đặt cạnh người, gần cùng khoảng cách đến camera ở cả hai góc. Giao diện live hiện sử dụng `height_cm`, chưa có công tắc chọn marker.

## Cách hệ thống hoạt động

### 1. Nhận diện người và tự chụp

Frontend dùng `getUserMedia()` để mở camera đã chọn. Nó gửi từng khung JPEG qua WebSocket, giới hạn cạnh dài **640 px**; chỉ có một request tracking đang chờ phản hồi tại một thời điểm. Nhịp gửi tự điều chỉnh theo độ trễ, nhắm khoảng 15–20 FPS trên máy phù hợp.

Backend chạy **MediaPipe Pose Landmarker Lite** (33 mốc cơ thể) với tối đa hai pose để phát hiện trường hợp nhiều người. API trả trạng thái `no_person`, `multiple_people`, `partial` hoặc `tracked`, cùng tọa độ `x/y/z` và mức hiển thị của các khớp. Tracking realtime không tạo mask để tiết kiệm CPU; các khớp được làm mượt ở frontend.

Frontend kiểm tra đầu, vai, tay, hông và chân có trong khung; dùng tỷ lệ ngang vai/chiều cao ảnh cùng mức che khuất khớp để hướng dẫn đứng chính diện hoặc nghiêng. Khi vị trí hông và chiều cao cơ thể ổn định đủ `capture_seconds`, ứng dụng tự lưu **ba khung hình** ở mỗi góc, cách nhau khoảng 180 ms. Nếu thiếu người, có nhiều người, mất toàn thân hoặc di chuyển, bộ đếm dừng/khởi động lại. Đây là kiểm tra tư thế theo quy tắc, chưa phải nhận diện chính xác góc xoay 3D.

### 2. Ước lượng số đo

API dùng model có **segmentation mask** riêng cho bước đo. Với mỗi cặp ảnh chính diện/nghiêng, OpenCV giữ vùng mask nối với thân người và tìm đỉnh đầu, bàn chân gần các mốc MediaPipe để giảm nhiễu nền. Nếu nhập chiều cao thật `H` và chiều cao silhouette là `P` pixel, tỷ lệ quy đổi của ảnh là **`P / H` pixel/cm**. Ảnh nghiêng được kiểm tra cùng tỷ lệ chiều cao với ảnh chính diện; camera và vị trí đứng phải giữ cố định. Nếu dùng marker, tỷ lệ lấy từ cạnh ArUco được phát hiện trong từng ảnh.

| Thông số | Cách tính hiện tại |
| --- | --- |
| Chiều cao | Giá trị đã nhập, hoặc chiều cao silhouette quy đổi bằng marker |
| Ngang vai, dài tay, dài thân, dài chân ngoài | Khoảng cách giữa các mốc khớp, quy đổi từ pixel sang cm |
| Ngang hông | Bề rộng mask ở vùng hông trong ảnh chính diện |
| Vòng ngực, eo, hông, đùi | Bề rộng trong ảnh chính diện + chiều sâu trong ảnh nghiêng tại vùng tương ứng; xấp xỉ chu vi theo **ellipse** |

Backend loại cặp ảnh không đủ người/marker/mask/khớp, yêu cầu tối thiểu hai cặp hợp lệ khi chụp ba cặp, rồi lấy **trung vị** từng số đo. Số đo cấu hình trong `measurements_cm` được ưu tiên; người dùng có thể sửa kết quả trên UI trước khi nhận gợi ý. Công thức phụ thuộc tư thế, quần áo đang mặc, góc camera và chiều cao nhập vào; chưa có sai số được kiểm chứng trên nhiều người. Cần đối chiếu với thước dây trước khi dùng để chọn size thực tế.

### 3. Nhận xét dáng và gợi ý size

Catalog mock có **12 sản phẩm** (6 áo, 6 quần), mỗi sản phẩm chứa nhóm nam/nữ/unisex, kiểu fit, tag dáng, asset SVG và bảng khoảng số đo cơ thể cho size S–XL. Backend so sánh vai với ngang hông và eo với ngực/hông để gắn nhãn dáng. Áo được xét theo ngực + vai; quần theo eo + hông + đùi. Trong các size, thuật toán ưu tiên size có các vòng chính **nằm trong khoảng**, sau đó chọn size gần tâm khoảng. Nếu không có size khớp, API trả size gần nhất với trạng thái `closest` và cảnh báo; nếu thiếu số đo, trả `unavailable`. Chiều dài thân/chân được nhắc riêng khi ngoài khoảng. Người dùng vẫn có thể tự đổi size hoặc chọn sản phẩm khác.

### 4. FASHAR thử đồ AR

Frontend đặt một mesh áo và một mesh quần lên video. Renderer chính dùng **Three.js/WebGL**: tạo thân áo/quần và các đoạn tay, chân bằng hình học đơn giản; cập nhật vị trí, độ nghiêng và chiều sâu tương đối theo vai, hông, khuỷu, cổ tay, gối, mắt cá từ pose. Bảng size, fit và chiều cao/số đo được dùng để đổi kích thước mesh. Có thể xoay người hoặc cử động nhẹ để xem mesh bám theo khớp. Khi không tạo được WebGL, frontend dùng renderer Canvas với asset SVG để hiển thị lớp áo/quần 2D.

Đây là **hình học demo**, chưa có mẫu 3D thực của nhà sản xuất, mô phỏng vải, xử lý che khuất tay–áo hoàn chỉnh hoặc đánh giá độ chật/rộng vật lý. Tọa độ `z` từ pose là độ sâu tương đối, không thay thế camera chiều sâu đã hiệu chuẩn. Chế độ `?preview=1` sử dụng pose mô phỏng để duyệt giao diện và cách hiển thị, không kiểm chứng tracking trên người thật.

## API và mã nguồn chính

| Endpoint | Chức năng |
| --- | --- |
| `GET /api/health` | Kiểm tra API và file model |
| `GET /api/config` | Trả cấu hình quét/camera |
| `GET /api/catalog` | Trả catalog và bảng size |
| `WS /api/tracking` | Nhận ảnh JPEG base64, trả trạng thái và landmarks |
| `POST /api/measurements` | Nhận `front_images`, `side_images`, `height_cm` hoặc `marker_cm`; trả số đo và số mẫu hợp lệ |
| `POST /api/recommendations` | Nhận số đo cùng nhóm đồ; trả size, trạng thái fit, lý do và nhãn dáng |

Backend nằm trong `backend/app/`: `vision/` xử lý MediaPipe và ảnh; `features/measurements/` chứa công thức đo; `features/recommendations/` chứa quy tắc chọn size; `features/catalog/` chứa dữ liệu mẫu. Frontend dùng `src/App.tsx` cho giao diện/camera, `src/scan.ts` cho tự chụp, `src/ar3d.ts` cho mesh 3D, `src/ar.ts` cho renderer dự phòng. Ảnh/video được xử lý trong bộ nhớ; ứng dụng không lưu mặc định lên server.

## Kiểm tra và hướng phát triển

Các lệnh kiểm tra hiện có: `npm run build`, `npm run check:scan`, `npm run check:tracking`, `npm run check:ar`, `npm run check:ar3d` trong `frontend/`; các test Python nằm trong `backend/tests/`. Việc chạy qua webcam thật, đo sai số với thước dây và đánh giá FPS trên máy đích vẫn cần thực hiện.

Các bước mở rộng hợp lý:

1. **Đo và hiệu chuẩn:** thu bộ ảnh có số đo thước dây để định lượng sai số; hướng dẫn chuẩn hóa tư thế/ánh sáng; thêm lựa chọn ArUco trực tiếp trong UI hoặc camera chiều sâu nếu cần độ chính xác cao hơn.
2. **AR trang phục:** thay mesh demo bằng asset 3D có rig theo từng sản phẩm, thêm segmentation/occlusion cho tay và người, cải thiện chuyển động vải và đo độ vừa thật.
3. **Catalog và size:** chuyển JSON mock sang dữ liệu sản phẩm thật, bảng size riêng cho từng hãng/sản phẩm, quản lý tồn kho và giải thích gợi ý rõ hơn khi số đo nằm giữa hai size.
4. **Vận hành:** đo hiệu năng trên nhiều CPU/camera, tối ưu inference, thêm HTTPS và reverse proxy cho triển khai ngoài localhost, quy định thời gian lưu/xóa ảnh nếu sau này có tính năng lưu phiên.
