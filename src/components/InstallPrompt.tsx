import React, { useState, useEffect } from 'react';
import { X, Share, PlusSquare, Download } from 'lucide-react';

export const InstallPrompt: React.FC = () => {
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // Kiểm tra xem đã cài đặt ra màn hình chính chưa
    const isRunningStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
    setIsStandalone(isRunningStandalone);

    // Kiểm tra xem có phải iPhone/iPad không
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);

    // Bắt sự kiện cài đặt của Android
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      if (!isRunningStandalone) setShowPrompt(true);
    });

    // Nếu là iOS và chưa cài đặt, tự động hiện hướng dẫn
    if (isIosDevice && !isRunningStandalone) {
      // Kiểm tra xem người dùng đã từng tắt thông báo này chưa (tránh làm phiền)
      const hasDismissed = localStorage.getItem('dismissedInstallPrompt');
      if (!hasDismissed) {
        // Delay 2 giây rồi mới hiện cho đỡ choáng
        setTimeout(() => setShowPrompt(true), 2000);
      }
    }
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowPrompt(false);
      }
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('dismissedInstallPrompt', 'true'); // Lưu lại để không làm phiền nữa
  };

  // Nếu đã cài app rồi, hoặc không đủ điều kiện hiện thì ẩn đi
  if (isStandalone || !showPrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[9990] bg-white rounded-2xl shadow-2xl border border-indigo-100 p-4 animate-in slide-in-from-bottom-5 fade-in duration-500">
      <button 
        onClick={handleDismiss}
        className="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-full transition-colors"
      >
        <X className="w-5 h-5" />
      </button>

      <div className="flex items-start space-x-4 pr-6">
        <div className="flex-shrink-0 bg-indigo-100 p-3 rounded-xl">
          <Download className="w-8 h-8 text-indigo-600" />
        </div>
        <div>
          <h3 className="text-base font-bold text-gray-900 mb-1">Cài đặt Ứng dụng TKB</h3>
          <p className="text-sm text-gray-600 mb-3">
            Thêm ứng dụng vào màn hình chính để truy cập nhanh hơn, không cần mở trình duyệt.
          </p>

          {isIOS ? (
            <div className="bg-indigo-50 rounded-lg p-3 text-sm text-indigo-800 font-medium">
              <p className="flex items-center mb-1.5">
                1. Bấm nút Chia sẻ <Share className="w-4 h-4 mx-1.5 inline" /> ở cạnh dưới màn hình.
              </p>
              <p className="flex items-center">
                2. Chọn "Thêm vào MH chính" <PlusSquare className="w-4 h-4 mx-1.5 inline" />
              </p>
            </div>
          ) : (
            <button
              onClick={handleInstallClick}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-md hover:bg-indigo-700 transition-colors w-full sm:w-auto"
            >
              Cài đặt ngay
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
