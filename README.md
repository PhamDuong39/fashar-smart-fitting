# FASHAR demo

Demo local dùng webcam để ước lượng số đo, chọn size từ catalog mẫu và thử quần áo AR 2.5D. Giao diện React chạy ở `http://localhost:5173`; Python API chạy ở `http://127.0.0.1:8000`.

## Duyệt giao diện khi chưa có camera

```bash
cd frontend
npm install
npm run dev
```

Mở `http://127.0.0.1:5173/?preview=1`. Chế độ này chạy độc lập với Python và camera; nó dùng dữ liệu số đo mẫu, catalog JSON local và hình người minh họa. Có thể thử lọc nam/nữ/unisex, áo/quần, đổi size, chọn hoặc bỏ trang phục và tải ảnh preview. Nhãn **UI PREVIEW** và **Dữ liệu minh họa** luôn hiển thị để phân biệt với phiên đo thật. Ảnh chụp hiện tại của giao diện nằm ở [docs/ui-preview.png](docs/ui-preview.png).

Phần kiểm thử webcam, phép đo và model nhận diện sẽ thực hiện khi có máy/camera phù hợp.

## Yêu cầu

- Python 3.10 hoặc mới hơn, Node.js 20 hoặc mới hơn.
- Chrome/Edge trên máy có webcam tích hợp hoặc USB. Trình duyệt cần quyền truy cập camera.
- Hai ảnh chụp cùng một người, toàn thân, một ảnh chính diện và một ảnh nghiêng 90°.
- In [marker ArUco ID 0](frontend/public/assets/aruco-marker.svg) ở tỷ lệ 100%; đo chiều dài **cạnh hình vuông đen** sau khi in, rồi nhập giá trị cm vào giao diện. Đặt marker trên bảng phẳng cạnh người, gần cùng khoảng cách tới camera, hướng mặt marker về camera ở cả hai ảnh. Camera cố định, người đứng tại cùng một vị trí khi xoay.

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

## Luồng demo

1. Bật camera; chọn camera khác trong danh sách nếu cần.
2. Đứng đủ toàn thân và để marker trong khung. Chụp chính diện.
3. Xoay nghiêng 90°, giữ nguyên vị trí đứng. Chụp ảnh thứ hai.
4. Bấm **Tính số đo**. Nếu ảnh thiếu marker, thiếu khớp hoặc silhouette không rõ, ứng dụng yêu cầu chụp lại.
5. Xem và chỉnh số đo, chọn nhóm trang phục, xác nhận để nhận gợi ý size.
6. Thử một áo và một quần trên camera, hoặc tải ảnh kết quả.

Các số đo chu vi lấy từ mặt trước và mặt bên theo tiết diện ellipse, là **ước lượng từ ảnh và quần áo đang mặc**. Kết quả cần đối chiếu với thước dây trước khi mua. Nhận xét dáng dựa vào tỷ lệ vai, eo, hông; ứng dụng không suy đoán giới tính hoặc thành phần cơ thể từ ảnh. AR dùng asset SVG và biến dạng theo điểm khớp; phù hợp tư thế chính diện, chuyển động nhẹ, chưa mô phỏng vải hay che khuất hoàn chỉnh.

## Cấu trúc

- `backend/vision.py`: nhận diện pose, marker và ước lượng số đo.
- `backend/catalog.py`: 12 món đồ và bảng size theo số đo cơ thể.
- `backend/main.py`: API và WebSocket tracking.
- `frontend/src/App.tsx`: giao diện và luồng camera.
- `frontend/src/ar.ts`: biến dạng texture quần áo lên video.
- `frontend/scripts/create_assets.py`: tạo 12 asset SVG và marker.

`GET /api/health` trả trạng thái model; `GET /api/catalog` trả catalog; `WS /api/tracking` trả landmarks; `POST /api/measurements` nhận ảnh chính diện/nghiêng và cạnh marker; `POST /api/recommendations` trả gợi ý size. Ảnh và video được xử lý trong bộ nhớ, không lưu mặc định.
