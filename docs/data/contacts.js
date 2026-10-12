// Danh bạ người nhận email. Sửa file này rồi tải lại trang, không cần chạy lại build_data.py.
//
// - "name" của nhà thầu phải khớp đúng cột "Nhà Thầu" trong Excel.
// - "region" phải khớp đúng cột "Miền". Khi chọn người nhận, hệ thống ưu tiên người cùng miền với cửa hàng.
// - Để trống "email" thì vẫn chọn được người nhận, nhưng phải tự điền địa chỉ khi gửi.
// - Thêm người mới: thêm một dòng vào đúng danh sách bên dưới, có dấu phẩy ở cuối dòng.
window.WARRANTY_CONTACTS = {
  // Chữ ký cuối email
  sender: '[Họ tên người gửi - bộ phận P.XD/P.KT]',

  // Nhà thầu. Khi mở cửa hàng, nhà thầu của cửa hàng được chọn sẵn.
  contractors: [
    { name: 'Phú Mỹ', email: '' },
  ],

  // Đội kỹ thuật (hộp thư nhóm). Được đưa vào CC khi gửi cho nhà thầu hoặc cửa hàng.
  technicalTeams: [
    { name: 'Kỹ thuật Miền Nam', region: 'Miền Nam', email: '' },
  ],

  // Nhân viên kỹ thuật (cá nhân). Thay bằng danh sách thật.
  technicians: [
    { name: 'Nguyễn Văn A', region: 'Miền Nam', email: '' },
  ],

  // Cửa hàng. Key là mã cửa hàng trong Excel.
  stores: {
    '2CAO': { email: '' },
    '2CBA': { email: '' },
  },
};
