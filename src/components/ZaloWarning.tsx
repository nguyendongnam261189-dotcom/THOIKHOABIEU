import React, { useEffect, useState } from 'react';

export const ZaloWarning: React.FC = () => {
  const [isZalo, setIsZalo] = useState(false);

  useEffect(() => {
    // Kiểm tra xem trình duyệt có chữ "Zalo" trong User Agent không
    const userAgent = navigator.userAgent || navigator.vendor;
    if (userAgent.toLowerCase().includes('zalo')) {
      setIsZalo(true);
    }
  }, []);

  if (!isZalo) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-indigo-600 flex flex-col items-center justify-center p-6 text-white text-center">
      <div className="bg-white/10 p-8 rounded-2xl backdrop-blur-md border border-white/20 max-w-sm w-full">
        <h2 className="text-2xl font-bold mb-4">⚠️ Chú ý</h2>
        <p className="mb-6 text-lg">
          Trình duyệt của Zalo không hỗ trợ Đăng nhập tài khoản Google.
        </p>
        <div className="bg-white text-indigo-900 rounded-xl p-4 text-left shadow-lg">
          <p className="font-bold mb-2">Cách khắc phục:</p>
          <ol className="list-decimal pl-5 space-y-2 font-medium">
            <li>Nhấn vào biểu tượng <span className="bg-gray-200 px-2 py-1 rounded">...</span> ở góc trên cùng bên phải màn hình.</li>
            <li>Chọn <strong>"Mở bằng trình duyệt"</strong> (hoặc Mở bằng Safari/Chrome).</li>
          </ol>
        </div>
      </div>
    </div>
  );
};
