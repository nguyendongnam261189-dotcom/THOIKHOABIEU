import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { AdminDashboard } from './pages/AdminDashboard';
import { TeacherView } from './pages/TeacherView';
import { ClassView } from './pages/ClassView';
import { SubstituteTeacher } from './pages/SubstituteTeacher';
import { TeacherManagement } from './pages/TeacherManagement';
import { UserManagement } from './pages/UserManagement';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Loader2, Clock, XCircle } from 'lucide-react';
import { ZaloWarning } from './components/ZaloWarning';
// THÊM DÒNG NÀY ĐỂ GỌI BẢNG THÔNG BÁO CÀI ĐẶT APP
import { InstallPrompt } from './components/InstallPrompt'; 

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
  // 🔥 BỔ SUNG 'manager' VÀO KHAI BÁO STATE
  const [role, setRole] = useState<'admin' | 'manager' | 'teacher' | 'ttcm' | null>(null);
  const [department, setDepartment] = useState<string | null>(null);
  const [teacherName, setTeacherName] = useState<string | null>(null); // THÊM STATE LƯU TÊN GIÁO VIÊN
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected' | null>(null);
  const [loading, setLoading] = useState(true);

  // Chống Google Translate tự động làm sai lệch chữ trên điện thoại Android
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
          const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
          
          if (userDoc.exists()) {
            const data = userDoc.data();
            // 🔥 BỔ SUNG 'manager' VÀO ÉP KIỂU (TYPE CASTING)
            setRole(data.role as 'admin' | 'manager' | 'teacher' | 'ttcm');
            setDepartment(data.department || null);
            setTeacherName(data.teacherName || null); // ĐỌC TÊN GIÁO VIÊN TỪ FIREBASE
            setStatus(data.status || 'pending');
          } else {
            // Lần đầu tiên đăng nhập chưa có record trong Database
            setRole('teacher');
            setDepartment(null);
            setTeacherName(null);
            setStatus('pending');
          }
        } catch (error) {
          console.error("Error fetching user role:", error);
          setRole('teacher');
          setDepartment(null);
          setTeacherName(null);
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
      {/* Gọi component chặn Zalo đã được import ở trên */}
      <ZaloWarning /> 
      
      {/* HIỂN THỊ BẢNG MỜI CÀI ĐẶT APP (Sẽ tự nổi lên sau 2s nếu dùng ĐTDĐ) */}
      <InstallPrompt />
      
      <Router>
        <Routes>
          <Route path="/login" element={!user ? <Login /> : <Navigate to="/" />} />
          
          <Route path="/" element={user ? <Layout role={role} /> : <Navigate to="/login" />}>
            {/* TRUYỀN THÊM BIẾN teacherName VÀO TRANG XEM TKB */}
            <Route index element={<TeacherView role={role} department={department} teacherName={teacherName} />} />
            <Route path="class" element={<ClassView />} />
            
            {/* Admin Routes */}
            <Route 
              path="admin" 
              element={role === 'admin' ? <AdminDashboard /> : <Navigate to="/" />} 
            />
            <Route 
              path="users" 
              element={role === 'admin' ? <UserManagement /> : <Navigate to="/" />} 
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
