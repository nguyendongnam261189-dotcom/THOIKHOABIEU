import React from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';
import { Calendar, Users, LogOut, Upload, Search } from 'lucide-react';

export const Layout: React.FC<{ role: 'admin' | 'teacher' | 'ttcm' | null }> = ({ role }) => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-indigo-600 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center">
              <Calendar className="h-8 w-8 mr-3" />
              <span className="font-bold text-xl">TKB Manager</span>
            </div>
            <nav className="hidden md:flex space-x-4">
              {role === 'admin' && (
                <>
                  <Link to="/admin" className="flex items-center px-3 py-2 rounded-md hover:bg-indigo-500">
                    <Upload className="h-5 w-5 mr-2" />
                    Quản lý Dữ liệu
                  </Link>
                  <Link to="/users" className="flex items-center px-3 py-2 rounded-md hover:bg-indigo-500">
                    <Users className="h-5 w-5 mr-2" />
                    Người dùng
                  </Link>
                </>
              )}
              {(role === 'admin' || role === 'ttcm') && (
                <>
                  <Link to="/teacher-management" className="flex items-center px-3 py-2 rounded-md hover:bg-indigo-500">
                    <Users className="h-5 w-5 mr-2" />
                    Giáo viên
                  </Link>
                  <Link to="/substitute" className="flex items-center px-3 py-2 rounded-md hover:bg-indigo-500">
                    <Users className="h-5 w-5 mr-2" />
                    Dạy thay
                  </Link>
                </>
              )}
              <Link to="/" className="flex items-center px-3 py-2 rounded-md hover:bg-indigo-500">
                <Search className="h-5 w-5 mr-2" />
                TKB Giáo viên
              </Link>
              <Link to="/class" className="flex items-center px-3 py-2 rounded-md hover:bg-indigo-500">
                <Calendar className="h-5 w-5 mr-2" />
                TKB Lớp
              </Link>
              <button onClick={handleLogout} className="flex items-center px-3 py-2 rounded-md hover:bg-indigo-500">
                <LogOut className="h-5 w-5 mr-2" />
                Đăng xuất
              </button>
            </nav>
            {/* Mobile menu button could go here */}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>

      {/* Mobile Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 w-full bg-white border-t border-gray-200 flex overflow-x-auto hide-scrollbar py-2 z-50 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
        <div className="flex px-2 space-x-6 min-w-max mx-auto">
          <Link to="/" className="flex flex-col items-center text-gray-600 hover:text-indigo-600 min-w-[60px]">
            <Search className="h-5 w-5" />
            <span className="text-[10px] mt-1 font-medium">TKB GV</span>
          </Link>
          <Link to="/class" className="flex flex-col items-center text-gray-600 hover:text-indigo-600 min-w-[60px]">
            <Calendar className="h-5 w-5" />
            <span className="text-[10px] mt-1 font-medium">TKB Lớp</span>
          </Link>
          {role === 'admin' && (
            <>
              <Link to="/admin" className="flex flex-col items-center text-gray-600 hover:text-indigo-600 min-w-[60px]">
                <Upload className="h-5 w-5" />
                <span className="text-[10px] mt-1 font-medium">Dữ liệu</span>
              </Link>
              <Link to="/users" className="flex flex-col items-center text-gray-600 hover:text-indigo-600 min-w-[60px]">
                <Users className="h-5 w-5" />
                <span className="text-[10px] mt-1 font-medium">Tài khoản</span>
              </Link>
            </>
          )}
          {(role === 'admin' || role === 'ttcm') && (
            <>
              <Link to="/teacher-management" className="flex flex-col items-center text-gray-600 hover:text-indigo-600 min-w-[60px]">
                <Users className="h-5 w-5" />
                <span className="text-[10px] mt-1 font-medium">Giáo viên</span>
              </Link>
              <Link to="/substitute" className="flex flex-col items-center text-gray-600 hover:text-indigo-600 min-w-[60px]">
                <Users className="h-5 w-5" />
                <span className="text-[10px] mt-1 font-medium">Dạy thay</span>
              </Link>
            </>
          )}
          <button onClick={handleLogout} className="flex flex-col items-center text-gray-600 hover:text-indigo-600 min-w-[60px]">
            <LogOut className="h-5 w-5" />
            <span className="text-[10px] mt-1 font-medium">Thoát</span>
          </button>
        </div>
      </nav>
    </div>
  );
};
