# FASHAR demo

Demo local dùng webcam để ước lượng số đo, chọn size từ catalog mẫu và thử quần áo AR 3D theo pose. Giao diện React chạy ở `http://localhost:5173`; Python API chạy ở `http://127.0.0.1:8000`.

## Duyệt giao diện khi chưa có camera

```bash
cd frontend
npm install
npm run dev
```

Mở `http://127.0.0.1:5173/?preview=1`. Chế độ này chạy độc lập với Python và camera; nó dùng dữ liệu số đo mẫu, catalog JSON local và hình người minh họa. Các nút **Chính diện / Nghiêng / Quay lưng / Đá chân** mô phỏng pose để thử mesh 3D ngay mà không phải quét lại. Có thể thử lọc nam/nữ/unisex, áo/quần, đổi size, chọn hoặc bỏ trang phục và tải ảnh preview. Nhãn **UI PREVIEW** và **Dữ liệu minh họa** luôn hiển thị để phân biệt với phiên đo thật. Ảnh chụp giao diện nằm ở [docs/ui-preview.png](docs/ui-preview.png).

Luồng chụp và ước lượng số đo trên người thật cần webcam, chiều cao đã biết và hai góc chụp đúng hướng để kiểm tra tại máy sử dụng.

## Yêu cầu

- Python 3.10 hoặc mới hơn, Node.js 20 hoặc mới hơn.
- Chrome/Edge trên máy có webcam tích hợp hoặc USB. Trình duyệt cần quyền truy cập camera.
- Người đứng đủ toàn thân trong khung, lần lượt chính diện và nghiêng khoảng 90°, giữ yên 3 giây ở mỗi góc để hệ thống tự chụp (có thể đổi thời gian trong cấu hình).
- Nhập chiều cao đã biết (mặc định 179 cm) làm mốc quy đổi tạm thời khi chưa dùng marker. Giữ camera cố định và đứng cùng một vị trí ở hai góc. API vẫn hỗ trợ [marker ArUco ID 0](frontend/public/assets/aruco-marker.svg) qua `marker_cm` khi cần kiểm tra cách đo cũ.

## Cài đặt và chạy

```bash
python3 -m pip install -r backend/requirements.txt --target backend/.deps
python3 backend/download_model.py
python3 frontend/scripts/create_assets.py
cd frontend && npm install
```

Mở hai terminal:

```bash
python3 backend/run.py
```

```bash
cd frontend && npm run dev
```

Nếu Python đã có môi trường ảo, có thể cài các gói vào đó rồi chạy `python backend/run.py`. `backend/run.py` ưu tiên gói trong `backend/.deps` nếu thư mục tồn tại.

Trên Windows PowerShell, mở terminal mới sau khi cài Python rồi dùng `py -3` và `npm.cmd`:

```powershell
py -3 -m pip install -r backend\requirements.txt --target backend\.deps
py -3 backend\download_model.py
py -3 frontend\scripts\create_assets.py
Set-Location frontend
npm.cmd ci
```

Chạy `py -3 backend\run.py` từ thư mục gốc trong terminal thứ nhất. Trong terminal thứ hai, chạy `Set-Location frontend` rồi `npm.cmd run dev`. Dùng `npm.cmd` nếu PowerShell không cho phép chạy `npm.ps1`.

Nếu PowerShell chưa nhận lệnh `py` sau khi cài Python, trên máy này có thể gọi trực tiếp `& "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe" backend\run.py` từ thư mục gốc. Nếu terminal đang ở thư mục `backend`, dùng `& "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe" .\run.py`.

## Cấu hình quét và camera

Sửa [backend/config.json](backend/config.json) bằng trình soạn thảo văn bản. Mặc định `height_cm` là `179`, `capture_seconds` là `3`, camera hướng `portrait` với độ phân giải **720 × 1080**. Muốn dùng camera ngang, đặt `orientation` thành `landscape` rồi đổi `width` thành `1080`, `height` thành `720`. Trình duyệt chỉ có thể *yêu cầu* độ phân giải này; camera không hỗ trợ sẽ tự chọn độ phân giải gần nhất. Kích thước thực tế hiện ở góc trên khung camera.

Điền số đo muốn dùng trực tiếp vào `measurements_cm`, ví dụ `"measurements_cm": {"chest": 96, "waist": 80}`. Các tên hợp lệ: `shoulder`, `chest`, `waist`, `hip`, `hip_width`, `arm_length`, `torso_length`, `outer_leg`, `thigh`. Chỉ những số đo được điền mới ghi đè kết quả ước lượng; để `{}` nếu muốn đo toàn bộ từ ảnh. Chiều cao trên giao diện được nạp từ config và vẫn có thể sửa trước khi quét. Backend đọc lại config mỗi lần đo; tải lại trang để giao diện nhận thời gian và hướng camera mới, rồi khởi động lại camera nếu nó đang bật.

## Luồng demo

1. Bật camera; hệ thống nhận diện người liên tục và báo khi thấy đủ toàn thân.
2. Đứng chính diện, giữ yên 3 giây. Hệ thống tự lưu ba khung hình.
3. Xoay nghiêng khoảng 90° tại cùng vị trí, giữ yên 3 giây để tự lưu góc thứ hai.
4. Hệ thống tự ước lượng số đo dựa trên chiều cao đã nhập. Nếu ảnh thiếu khớp hoặc silhouette không rõ, quét lại góc nghiêng.
5. Xem và chỉnh số đo, chọn nhóm trang phục, xác nhận để nhận gợi ý size.
6. Thử một áo và một quần trên camera, hoặc tải ảnh kết quả.

Các số đo chu vi lấy từ mặt trước và mặt bên theo tiết diện ellipse, là **ước lượng từ ảnh, chiều cao đã nhập và quần áo đang mặc**. Kết quả cần đối chiếu với thước dây trước khi mua. Nhận xét dáng dựa vào tỷ lệ vai, eo, hông; ứng dụng không suy đoán giới tính hoặc thành phần cơ thể từ ảnh. AR mặc định dùng mesh WebGL 3D: thân áo/quần xoay theo vai và độ sâu pose, tay áo bám vai–khuỷu–cổ tay, hai ống quần bám hông–gối–mắt cá. Khi thiếu WebGL, ứng dụng tự dùng renderer SVG 2D cũ. Kích thước áo/quần thay đổi theo size được gợi ý hoặc size bạn chọn, còn tỷ lệ pixel/cm theo chiều cao đã đo và tư thế đang thấy trong camera. Có thể bấm **Chỉnh số đo** khi đang thử đồ rồi xác nhận lại để cập nhật gợi ý size. Đây là mesh demo tạo bằng hình học, chưa phải mẫu 3D của nhà sản xuất; chưa mô phỏng vải, che khuất bởi cơ thể hay fitting vật lý chính xác.

## Cấu trúc

Tracking hướng tới 20 FPS, tự giảm nhịp mục tiêu xuống khoảng 15 FPS theo thời gian phản hồi; máy xử lý chậm hơn có thể đạt thấp hơn. FE chỉ gửi một ảnh tại một thời điểm, hiển thị FPS phản hồi thực tế trên camera. Ảnh tracking giới hạn cạnh dài 640 px và không chạy segmentation; ảnh tự chụp để tính số đo vẫn giữ chất lượng cao và segmentation riêng. Bộ lọc khớp phản hồi nhanh hơn khi chuyển động. Mesh áo có phần cổ–vai liền thân và chỏm vai nối tay áo. Kiểm tra nhịp tracking bằng `cd frontend` rồi `npm run check:tracking`.

Backend chia theo feature, giữ nguyên endpoint, cấu hình và lệnh `python backend/run.py`:

```text
backend/
├── app/
│   ├── main.py                  # Khởi tạo FastAPI, middleware, ghép router
│   ├── core/
│   │   ├── paths.py             # Đường dẫn config và model
│   │   └── settings.py          # Đọc và kiểm tra cấu hình
│   ├── vision/
│   │   ├── engine.py            # MediaPipe, pose, segmentation
│   │   ├── images.py            # Giải mã ảnh camera
│   │   └── dependencies.py      # Cache engine đo và tracking
│   └── features/
│       ├── catalog/             # router.py, data.py
│       ├── recommendations/     # router.py, schemas.py, service.py
│       ├── measurements/        # router.py, schemas.py, service.py, estimator.py
│       ├── tracking/            # router.py: WebSocket tracking trực tiếp
│       ├── configuration/       # router.py: cấu hình cho FE
│       └── health/              # router.py: trạng thái API/model
├── tests/                       # Các test hiện có
├── models/                      # Model MediaPipe tải về
├── config.json                  # Cấu hình chỉnh tay
├── main.py                      # Entry point tương thích main:app
├── run.py                       # Chạy API và nạp backend/.deps
├── download_model.py            # Tải model
└── requirements.txt
```

Trong mỗi feature, `router.py` phụ trách HTTP/WebSocket, `schemas.py` định nghĩa request và `service.py` chứa nghiệp vụ. Phần công thức đo nằm ở `measurements/estimator.py`; dữ liệu sản phẩm và bảng size nằm ở `catalog/data.py`. Feature chỉ có endpoint đơn giản không cần thêm service rỗng. Các thư mục `.deps` và `.cache` phục vụ môi trường chạy tại máy.

- `frontend/src/App.tsx`: giao diện và luồng camera.
- `frontend/src/scan.ts`: kiểm tra toàn thân, góc xoay và thời gian đứng yên từ config.
- `frontend/src/ar3d.ts`: dựng và cập nhật mesh 3D theo các khớp pose, độ sâu, size và hướng người.
- `frontend/src/ar.ts`: renderer SVG 2D dự phòng khi không có WebGL.
- `frontend/scripts/create_assets.py`: tạo 12 asset SVG và marker.

`GET /api/health` trả trạng thái model; `GET /api/config` trả cấu hình hiện tại; `GET /api/catalog` trả catalog; `WS /api/tracking` trả landmarks gồm độ sâu `z`; `POST /api/measurements` nhận ảnh chính diện/nghiêng kèm `height_cm` hoặc `marker_cm`; `POST /api/recommendations` trả gợi ý size. Khi không có size khớp mọi vòng, API trả size gần nhất kèm cảnh báo để bạn cân nhắc. Ảnh và video được xử lý trong bộ nhớ, không lưu mặc định. Kiểm tra logic tự chụp bằng `cd frontend` rồi `npm run check:scan`; kiểm tra scale AR bằng `npm run check:ar` và pose 3D bằng `npm run check:ar3d`.
