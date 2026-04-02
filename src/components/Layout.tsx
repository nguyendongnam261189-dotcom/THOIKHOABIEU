import React, { useState, useEffect } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { auth, db } from '../firebase';
import { signOut } from 'firebase/auth';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { Calendar, Users, LogOut, Upload, BarChart3, Menu, X, PhoneCall } from 'lucide-react';

export const Layout: React.FC<{ role: 'admin' | 'manager' | 'teacher' | 'ttcm' | null }> = ({ role }) => {
  const navigate = useNavigate();
  const location = useLocation(); 
  const [pendingCount, setPendingCount] = useState(0);
  
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      localStorage.clear(); 
      sessionStorage.clear();
      window.location.href = '/login'; 
    } catch (error) {
      console.error("Lỗi đăng xuất:", error);
    }
  };

  useEffect(() => {
    if (role !== 'admin') return;
    const q = query(collection(db, 'users'), where('status', '==', 'pending'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPendingCount(snapshot.docs.length);
    });
    return () => unsubscribe();
  }, [role]);

  const isActive = (path: string) => location.pathname === path;

  const getDesktopMenuClass = (path: string) => {
    return `flex items-center px-3 py-2 rounded-md font-medium transition-colors ${
      isActive(path) 
        ? 'bg-indigo-900 text-white shadow-inner' 
        : 'text-indigo-50 hover:bg-indigo-500 hover:text-white' 
    }`;
  };

  const getMobileMenuClass = (path: string) => {
    return `flex items-center w-full px-4 py-3 rounded-xl font-medium transition-colors ${
      isActive(path)
        ? 'bg-indigo-100 text-indigo-800' 
        : 'text-gray-600 hover:bg-gray-100' 
    }`;
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-indigo-600 text-white shadow-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            
            <div 
              className="flex items-center cursor-pointer hover:opacity-80 transition-opacity" 
              onClick={() => window.location.href = '/'}
              title="Về Trang chủ & Làm mới dữ liệu"
            >
              <Calendar className="h-8 w-8 mr-3" />
              <span className="font-bold text-xl tracking-tight">TKB Manager</span>
            </div>
            
            <nav className="hidden md:flex space-x-2">
              {/* 🔥 CẬP NHẬT: Đổi tên và icon thành Danh bạ */}
              <Link to="/" className={getDesktopMenuClass('/')}>
                <PhoneCall className="h-4 w-4 mr-2" /> Danh bạ
              </Link>
              <Link to="/class" className={getDesktopMenuClass('/class')}>
                <Calendar className="h-4 w-4 mr-2" /> TKB Lớp
              </Link>

              {/* 🔥 ĐÃ MỞ KHÓA MENU THỐNG KÊ CHO TẤT CẢ QUYỀN (BAO GỒM TEACHER) */}
              {(role === 'admin' || role === 'manager' || role === 'ttcm' || role === 'teacher') && (
                <Link to="/dashboard" className={getDesktopMenuClass('/dashboard')}>
                  <BarChart3 className="h-4 w-4 mr-2" /> Thống kê
                </Link>
              )}

              {(role === 'admin' || role === 'ttcm') && (
                <>
                  <Link to="/teacher-management" className={getDesktopMenuClass('/teacher-management')}>
                    <Users className="h-4 w-4 mr-2" /> Giáo viên
                  </Link>
                  <Link to="/substitute" className={getDesktopMenuClass('/substitute')}>
                    <Users className="h-4 w-4 mr-2" /> Dạy thay
                  </Link>
                </>
              )}

              {role === 'admin' && (
                <>
                  <Link to="/admin" className={getDesktopMenuClass('/admin')}>
                    <Upload className="h-4 w-4 mr-2" /> Dữ liệu
                  </Link>
                  <Link to="/users" className={`${getDesktopMenuClass('/users')} relative`}>
                    <Users className="h-4 w-4 mr-2" /> Tài khoản
                    {pendingCount > 0 && (
                      <span className="absolute top-1 right-1 flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                      </span>
                    )}
                  </Link>
                </>
              )}
              
              <button 
                onClick={handleLogout} 
                className="flex items-center px-3 py-2 rounded-md font-medium text-red-100 hover:bg-red-500 hover:text-white transition-colors ml-2"
              >
                <LogOut className="h-4 w-4 mr-2" /> Thoát
              </button>
            </nav>

            <div className="md:hidden flex items-center">
              <button 
                onClick={() => setIsMobileMenuOpen(true)}
                className="p-2 rounded-md hover:bg-indigo-500 transition-colors focus:outline-none relative"
              >
                <Menu className="h-7 w-7 text-white" />
                {pendingCount > 0 && role === 'admin' && (
                  <span className="absolute top-1 right-1 flex h-3 w-3">
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500 border-2 border-indigo-600"></span>
                  </span>
                )}
              </button>
            </div>

          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-10">
        <Outlet />
      </main>

      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div 
            className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity" 
            onClick={() => setIsMobileMenuOpen(false)}
          ></div>

          <div className="relative ml-auto flex h-full w-[280px] max-w-xs flex-col overflow-y-auto bg-white shadow-2xl animate-in slide-in-from-right-full duration-300">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 bg-indigo-50/50">
              <span className="font-bold text-xl text-indigo-900">Tính năng</span>
              <button 
                onClick={() => setIsMobileMenuOpen(false)}
                className="rounded-full p-2 text-gray-500 hover:bg-gray-200 transition-colors"
              >
                <X className="h-6 w-6 text-gray-700" />
              </button>
            </div>

            <div className="px-4 py-6 space-y-2">
              {/* 🔥 CẬP NHẬT: Đổi tên và icon trên giao diện Điện thoại */}
              <Link to="/" onClick={() => setIsMobileMenuOpen(false)} className={getMobileMenuClass('/')}>
                <PhoneCall className="h-5 w-5 mr-4" /> Danh bạ & TKB
              </Link>
              
              <Link to="/class" onClick={() => setIsMobileMenuOpen(false)} className={getMobileMenuClass('/class')}>
                <Calendar className="h-5 w-5 mr-4" /> Tra TKB Lớp học
              </Link>

              {/* 🔥 ĐÃ MỞ KHÓA MENU THỐNG KÊ CHO TẤT CẢ QUYỀN TRÊN ĐIỆN THOẠI */}
              {(role === 'admin' || role === 'manager' || role === 'ttcm' || role === 'teacher') && (
                <div className="pt-4 pb-2">
                  <p className="px-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Thống kê & Báo cáo</p>
                  <Link to="/dashboard" onClick={() => setIsMobileMenuOpen(false)} className={`mt-2 ${getMobileMenuClass('/dashboard')}`}>
                    <BarChart3 className="h-5 w-5 mr-4" /> Bảng Thống kê
                  </Link>
                </div>
              )}

              {(role === 'admin' || role === 'ttcm') && (
                <div className="pt-4 pb-2">
                  <p className="px-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Quản lý Chuyên môn</p>
                  <Link to="/teacher-management" onClick={() => setIsMobileMenuOpen(false)} className={`mt-2 ${getMobileMenuClass('/teacher-management')}`}>
                    <Users className="h-5 w-5 mr-4" /> Phân công GV
                  </Link>
                  <Link to="/substitute" onClick={() => setIsMobileMenuOpen(false)} className={`mt-2 ${getMobileMenuClass('/substitute')}`}>
                    <Users className="h-5 w-5 mr-4" /> Xếp Dạy thay
                  </Link>
                </div>
              )}

              {role === 'admin' && (
                <div className="pt-4 pb-2">
                  <p className="px-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Quản trị Hệ thống</p>
                  <Link to="/admin" onClick={() => setIsMobileMenuOpen(false)} className={`mt-2 ${getMobileMenuClass('/admin')}`}>
                    <Upload className="h-5 w-5 mr-4" /> Tải dữ liệu TKB
                  </Link>
                  <Link to="/users" onClick={() => setIsMobileMenuOpen(false)} className={`mt-2 relative ${getMobileMenuClass('/users')}`}>
                    <Users className="h-5 w-5 mr-4" /> Duyệt Tài khoản
                    {pendingCount > 0 && (
                      <span className="absolute right-4 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow-sm">
                        {pendingCount} mới
                      </span>
                    )}
                  </Link>
                </div>
              )}

              <div className="pt-8 mt-8 border-t border-gray-100">
                <button 
                  onClick={handleLogout} 
                  className="flex items-center justify-center w-full px-4 py-3 rounded-xl font-bold text-white bg-red-500 hover:bg-red-600 transition-colors shadow-md"
                >
                  <LogOut className="h-5 w-5 mr-2" /> Đăng xuất hệ thống
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
