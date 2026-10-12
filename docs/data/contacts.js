// Danh bạ nhận email. Sửa file này rồi tải lại trang, không cần chạy lại build_data.py.
// Để trống "email" thì nút gửi vẫn mở được, người gửi tự điền người nhận.
// Tên nhà thầu và mã cửa hàng phải khớp đúng với file Excel.
window.WARRANTY_CONTACTS = {
  // Chữ ký cuối email
  sender: '[Họ tên người gửi - bộ phận P.XD/P.KT]',

  // Key: tên nhà thầu trong cột "Nhà Thầu" của Excel
  contractors: {
    'Phú Mỹ': { email: '' },
  },

  // Key: mã cửa hàng (cột "Mã CH")
  stores: {
    '2CAO': { email: '' },
    '2CBA': { email: '' },
  },

  // Key: miền (cột "Miền"). "default" dùng khi miền không có trong danh sách.
  technicians: {
    'Miền Nam': { email: '' },
    default: { email: '' },
  },
};
