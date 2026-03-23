import React, { useState } from 'react';
import { auth, googleProvider } from '../firebase';
import { signInWithPopup } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Calendar } from 'lucide-react';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const [error, setError] = useState('');

  const handleGoogleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      // Check if user exists in Firestore
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);

      if (!userDoc.exists()) {
        // Create new user as teacher by default, but admin for the owner
        const isOwner = user.email === 'nguyendongnam261189@gmail.com';
        const role = isOwner ? 'admin' : 'teacher';
        const status = isOwner ? 'approved' : 'pending';
        
        await setDoc(userDocRef, {
          uid: user.uid,
          email: user.email,
          name: user.displayName,
          role: role,
          status: status
        });
      } else if (user.email === 'nguyendongnam261189@gmail.com' && userDoc.data().role !== 'admin') {
        // Upgrade existing owner account to admin
        await setDoc(userDocRef, { role: 'admin', status: 'approved' }, { merge: true });
      }

      navigate('/');
    } catch (err: any) {
      if (err.code === 'auth/cancelled-popup-request' || err.code === 'auth/popup-closed-by-user') {
        // Ignore or show a friendly message if the user simply closed the popup
        setError('Đăng nhập đã bị hủy. Vui lòng nhấn nút Đăng nhập lại.');
      } else if (err.code === 'auth/popup-blocked') {
        setError('Trình duyệt đã chặn cửa sổ đăng nhập. Vui lòng cho phép mở popup (cửa sổ bật lên) cho trang web này.');
      } else {
        setError(err.message || 'Đã xảy ra lỗi trong quá trình đăng nhập.');
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-xl shadow-lg">
        <div className="text-center">
          <Calendar className="mx-auto h-12 w-12 text-indigo-600" />
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            Quản lý Thời khóa biểu
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Đăng nhập để xem và quản lý lịch dạy
          </p>
        </div>
        
        {error && (
          <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div>
          <button
            onClick={handleGoogleLogin}
            className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Đăng nhập với Google
          </button>
        </div>
      </div>
    </div>
  );
};
