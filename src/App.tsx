import React, { useState, useEffect, useMemo } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { AdminDashboard } from './pages/AdminDashboard';
// 🔥 CẬP NHẬT: Thay thế TeacherView bằng Directory
import { Directory } from './pages/Directory'; 
import { ClassView } from './pages/ClassView';
import { SubstituteTeacher } from './pages/SubstituteTeacher';
import { TeacherManagement } from './pages/TeacherManagement';
import { UserManagement } from './pages/UserManagement';
import { Dashboard } from './pages/Dashboard'; 
import { ErrorBoundary } from './components/ErrorBoundary';
import { Loader2, Clock, XCircle, HardHat, AlertTriangle } from 'lucide-react';
import { ZaloWarning } from './components/ZaloWarning';
import { InstallPrompt } from './components/InstallPrompt'; 

// ========================================================
// 🔥 CẤU HÌNH CHẾ ĐỘ BẢO TRÌ (MỀM)
// Thầy chỉ cần đổi thành false để mở lại hệ thống bình thường
// ========================================================
const IS_MAINTENANCE = false; 

/**
 * 🚧 Component Trang Bảo trì
 */
const MaintenancePage = () => (
  <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
    <div className="bg-white p-10 rounded-3xl shadow-xl max-w-lg w-full border border-orange-100">
      <div className="relative mb-6 inline-block">
        <HardHat className="w-20 h-20 text-orange-50 mx-auto" />
        <AlertTriangle className="w-8 h-8 text-amber-500 absolute -bottom-1 -right-1 bg-white rounded-full p-1 shadow-sm" />
      </div>
      
      <h2 className="text-3xl font-extrabold text-gray-800 mb-4">Hệ thống đang nâng cấp</h2>
      
      <div className="space-y-4 text-gray-600 leading-relaxed mb-8">
        <p>
          Chúng tôi đang tiến hành đồng bộ dữ liệu Thời khóa biểu mới để phục vụ quý thầy cô tốt hơn.
        </p>
        <div className="bg-orange-50 p-4 rounded-2xl flex items-center justify-center gap-3 text-orange-700 font-bold border border-orange-100">
          <Clock className="w-5 h-5" />
          Dự kiến hoàn tất: Sau 19h00 chiều nay
        </div>
        <p className="text-sm italic">
          Xin lỗi quý thầy cô vì sự bất tiện này!
        </p>
      </div>

      <div className="pt-6 border-t border-gray-100">
        <p className="text-xs text-gray-400">© 2026 Hệ thống Quản lý Thời khóa biểu</p>
      </div>
    </div>
  </div>
);

const PendingApproval = () => (
  <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
    <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full text-center">
      <Clock className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
      <h2 className="text-2xl font-bold text-gray-800 mb-2">Chờ phê duyệt</h2>
      <p className="text-gray-600 mb-6">
        Tài khoản của bạn đã được đăng ký và đang chờ Quản trị viên phê duyệt. Vui lòng quay lại sau.
      </p>
      <button 
        onClick={() => auth.signOut()}
        className="text-indigo-600 hover:text-indigo-800 font-medium"
      >
        Đăng xuất
      </button>
    </div>
  </div>
);

const Rejected = () => (
  <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
    <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full text-center">
      <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
      <h2 className="text-2xl font-bold text-gray-800 mb-2">Từ chối truy cập</h2>
      <p className="text-gray-600 mb-6">
        Tài khoản của bạn không được cấp quyền truy cập vào hệ thống.
      </p>
      <button 
        onClick={() => auth.signOut()}
        className="text-indigo-600 hover:text-indigo-800 font-medium"
      >
        Đăng xuất
      </button>
    </div>
  </div>
);

const App: React.FC = () => {
  const [user, setUser] = useState<any>(null);
  const [role, setRole] = useState<'admin' | 'manager' | 'teacher' | 'ttcm' | null>(null);
  const [department, setDepartment] = useState<string | null>(null);
  const [teacherName, setTeacherName] = useState<string | null>(null);
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected' | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.documentElement.lang = "vi";
    document.documentElement.setAttribute("translate", "no");
    let meta = document.querySelector('meta[name="google"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'google');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', 'notranslate');
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        try {
          if (!IS_MAINTENANCE) {
            const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
            if (userDoc.exists()) {
              const data = userDoc.data();
              setRole(data.role as 'admin' | 'manager' | 'teacher' | 'ttcm');
              setDepartment(data.department || null);
              setTeacherName(data.teacherName || null);
              setStatus(data.status || 'pending');
            } else {
              setRole('teacher');
              setStatus('pending');
            }
          }
        } catch (error) {
          console.error("Error fetching user role:", error);
          setRole('teacher');
          setStatus('pending');
        }
      } else {
        setUser(null);
        setRole(null);
        setDepartment(null);
        setTeacherName(null);
        setStatus(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (IS_MAINTENANCE && !loading) {
    return <MaintenancePage />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="h-12 w-12 text-indigo-600 animate-spin" />
      </div>
    );
  }

  if (user && status === 'pending') {
    return <PendingApproval />;
  }

  if (user && status === 'rejected') {
    return <Rejected />;
  }

  return (
    <ErrorBoundary>
      <ZaloWarning /> 
      <InstallPrompt />
      
      <Router>
        <Routes>
          <Route path="/login" element={!user ? <Login /> : <Navigate to="/" />} />
          
          <Route path="/" element={user ? <Layout role={role} /> : <Navigate to="/login" />}>
            {/* 🔥 CẬP NHẬT: Đặt Trang Danh bạ làm trang chủ mặc định (index) */}
            <Route index element={<Directory role={role} department={department} teacherName={teacherName} />} />
            <Route path="class" element={<ClassView />} />
            
            <Route 
              path="admin" 
              element={role === 'admin' ? <AdminDashboard /> : <Navigate to="/" />} 
            />
            <Route 
              path="users" 
              element={role === 'admin' ? <UserManagement /> : <Navigate to="/" />} 
            />
            <Route 
              path="dashboard" 
              element={(role === 'admin' || role === 'manager' || role === 'ttcm' || role === 'teacher') ? <Dashboard role={role} department={department} /> : <Navigate to="/" />} 
            />
            <Route 
              path="substitute" 
              element={(role === 'admin' || role === 'ttcm') ? <SubstituteTeacher role={role} department={department} /> : <Navigate to="/" />} 
            />
            <Route 
              path="teacher-management" 
              element={(role === 'admin' || role === 'ttcm') ? <TeacherManagement role={role} department={department} /> : <Navigate to="/" />} 
            />
          </Route>
        </Routes>
      </Router>
    </ErrorBoundary>
  );
};

export default App;
