# 🍽️ GoMeal - Hệ Thống Quản Lý Thực Đơn Nhà Hàng Thông Minh

Một dự án **ứng dụng web full-stack** được xây dựng trên nền tảng **Node.js + MySQL**, mô phỏng hệ thống quản lý thực đơn nhà hàng thông minh hiện đại với trải nghiệm đặt món không tiếp xúc (QR Code), gợi ý món ăn, tự động ẩn món hết nguyên liệu và quản trị toàn diện.

| **Môn học**              | **Đồ án cơ sở**                                      |
|--------------------------|-----------------------------------------------------|
| **Nhóm**                 | **Nhóm 4**                           |
| **Giảng viên hướng dẫn** | **Nguyễn Thị Vân**                                  |

### **Thành viên Nhóm**

| **STT** | **Họ và Tên**          | **Mã Sinh Viên** |
|---------|------------------------|------------------|
| 1       | Nguyễn Thọ Nhân        | 23010786         |
| 2       | Phạm Anh Thái          | 23010784         |
| 3       | Nguyễn Xuân Chức       | 23010452         |

---

## 🚀 Giới Thiệu Dự Án (Project Introduction)

**GoMeal** không chỉ là một menu điện tử thông thường. Dự án được phát triển nhằm giải quyết bài toán cốt lõi của các nhà hàng hiện nay: **tối ưu hóa trải nghiệm khách hàng** và **tăng hiệu quả vận hành nội bộ** trong bối cảnh số hóa mạnh mẽ.

Chỉ với **một thao tác quét mã QR** tại bàn, khách hàng đã có thể:
- Xem thực đơn đẹp mắt, tìm kiếm/lọc món nhanh chóng
- Thấy ngay món nào đã hết nguyên liệu (tự động ẩn)
- Đặt món, áp dụng khuyến mãi, nhận gợi ý món/combo thông minh
- Theo dõi trạng thái đơn hàng realtime
- Sử dụng chatbot hỗ trợ cơ bản

Phía quản lý nhà hàng được trang bị bộ công cụ toàn diện để:
- Quản lý thực đơn linh hoạt (thêm/sửa/ẩn món, cập nhật nguyên liệu)
- Xử lý đơn hàng thời gian thực
- Quản lý nhân sự & phân quyền
- Theo dõi doanh thu, món bán chạy
- Quản lý bàn ăn và hệ thống QR Code

Với công nghệ **Node.js** (xử lý realtime) + **MySQL** + giao diện **HTML/CSS/JS** responsive, GoMeal mang đến giải pháp nhanh, ổn định, dễ mở rộng và hoàn toàn phù hợp với xu hướng “không tiếp xúc” hiện nay.

---

## ✨ Các Tính Năng Nổi Bật

### 1. Kiến Trúc & Công Nghệ
- **Backend**: Node.js + Express.js (RESTful API, realtime)
- **Frontend**: HTML5, CSS3, Vanilla JavaScript (responsive 100%)
- **Database**: MySQL (tối ưu truy vấn thống kê & quản lý nguyên liệu)
- **Realtime**: Cập nhật trạng thái đơn hàng ngay lập tức
- **Security**: JWT Authentication, bcrypt, input validation

### 2. Chức năng cho Khách hàng (User)
- Quét QR → truy cập menu điện tử theo bàn
- Xem thực đơn (danh mục, hình ảnh, giá, mô tả)
- Tự động ẩn món hết nguyên liệu
- Tìm kiếm & lọc món ăn
- Đặt món, chỉnh sửa giỏ hàng, áp dụng khuyến mãi
- Xem trạng thái đơn hàng realtime
- Nhận gợi ý món ăn / combo
- Đăng ký/đăng nhập tài khoản thành viên (tích điểm)
- Chatbot hỗ trợ cơ bản

### 3. Chức năng cho Quản trị viên (Admin)
- Đăng nhập & phân quyền hệ thống
- Quản lý thực đơn (danh mục + món ăn: thêm/sửa/ẩn/hết nguyên liệu)
- Quản lý đơn hàng (xem, cập nhật trạng thái, hủy)
- Quản lý khách hàng & lịch sử đặt món/bàn
- Quản lý nhân sự (thêm/sửa/khóa, phân quyền thu ngân/quản lý)
- Quản lý khuyến mãi & điểm tích lũy thành viên
- Thống kê báo cáo (doanh thu, món bán chạy)
- Quản lý bàn ăn & mã QR Code
- Cấu hình thông tin nhà hàng

### 4. Tính Năng Thông Minh & Bảo Mật
- **Quản lý nguyên liệu (Recipe)**: Tự động kiểm tra & ẩn món hết hàng
- **Gợi ý món ăn**: Dựa trên món phổ biến và lịch sử
- **Realtime notification**: Trạng thái đơn hàng cập nhật ngay lập tức
- **Bảo mật**: JWT, mã hóa mật khẩu, chống SQL Injection
- **Responsive**: Hoạt động tốt trên điện thoại & máy tính

---

## 🛠️ Công Nghệ Sử Dụng

- **Backend**: Node.js, Express.js
- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Database**: MySQL
- **Authentication**: JWT + bcrypt
- **Công cụ khác**: Postman (test API), Git, GitHub

---

## 📸 Hình ảnh dự án (Screenshots)
*(Bạn sẽ thêm ảnh thực tế sau khi deploy)*

---
