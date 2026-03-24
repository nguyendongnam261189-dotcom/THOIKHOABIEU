import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Users, Save, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

export const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [originalUsers, setOriginalUsers] = useState<User[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  const departments = [
    'Toán - Tin', 
    'KHTN và Công nghệ', 
    'Văn - GDCD', 
    'Ngoại ngữ', 
    'Sử - Địa', 
    'Nghệ thuật - Thể chất',
    'Chung'
  ];

  useEffect(() => {
    const fetchUsers = async () => {
      setLoading(true);
      try {
        const querySnapshot = await getDocs(collection(db, 'users'));
        const usersData = querySnapshot.docs.map(doc => ({
          uid: doc.id,
          ...doc.data()
        } as User));
        
        usersData.sort((a, b) => {
          if (a.status === 'pending' && b.status !== 'pending') return -1;
          if (a.status !== 'pending' && b.status === 'pending') return 1;
          return a.email.localeCompare(b.email);
        });
        
        setUsers(usersData);
        setOriginalUsers(JSON.parse(JSON.stringify(usersData)));
      } catch (error) {
        console.error("Error fetching users:", error);
        setStatus({ type: 'error', message: 'Không thể tải danh sách người dùng.' });
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, []);

  const handleRoleChange = (uid: string, role: 'admin' | 'teacher' | 'ttcm') => {
    setUsers(prevUsers => prevUsers.map(user => {
      if (user.uid === uid) {
        return { ...user, role, department: role === 'admin' ? null : user.department };
      }
      return user;
    }));
  };

  const handleDepartmentChange = (uid: string, department: string) => {
    setUsers(prevUsers => prevUsers.map(user => 
      user.uid === uid ? { ...user, department } : user
    ));
  };

  const handleStatusChange = (uid: string, newStatus: 'pending' | 'approved' | 'rejected') => {
    setUsers(prevUsers => prevUsers.map(user => 
      user.uid === uid ? { ...user, status: newStatus } : user
    ));
  };

  const handleSave = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const updatePromises: Promise<void>[] = [];
      let changedCount = 0;

      users.forEach(user => {
        const originalUser = originalUsers.find(u => u.uid === user.uid);
        
        const isChanged = !originalUser || 
                          originalUser.role !== user.role || 
                          originalUser.department !== user.department || 
                          originalUser.status !== user.status;

        if (isChanged) {
          const userRef = doc(db, 'users', user.uid);
          // Gom lệnh thay đổi vào danh sách chờ
          updatePromises.push(
            updateDoc(userRef, {
              role: user.role,
              department: user.department || null,
              status: user.status || 'approved'
            })
          );
          changedCount++;
        }
      });

      // Nếu không ai bị thay đổi, báo luôn
      if (changedCount === 0) {
        setStatus({ type: 'success', message: 'Không có thay đổi nào mới cần lưu.' });
        setSaving(false);
        return;
      }

      // 🕒 TẠO BỘ ĐẾM GIỜ (TIMEOUT) CHỐNG TREO MẠNG
      const timeoutPromise = new Promise<void>((_, reject) => 
        setTimeout(() => reject(new Error("Quá thời gian kết nối (10s). Mạng có thể đang yếu, vui lòng thử lại!")), 10000)
      );

      // Chạy đua giữa việc Firebase lưu dữ liệu và Bộ đếm giờ (cái nào đến trước thì chạy)
      await Promise.race([Promise.all(updatePromises), timeoutPromise]);
      
      // Thành công thì cập nhật lại bản gốc
      setOriginalUsers(JSON.parse(JSON.stringify(users)));
      setStatus({ type: 'success', message: `Đã lưu thành công phân quyền cho ${changedCount} người dùng!` });
      
    } catch (error: any) {
      console.error("Error updating users:", error);
      setStatus({ type: 'error', message: `${error.message}` });
    } finally {
      setSaving(false); // Đảm bảo vòng quay luôn bị tắt
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800 flex items-center">
            <Users className="mr-2 text-indigo-600" /> Quản lý Người dùng & Phân quyền
          </h2>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white px-4 py-2 rounded-lg flex items-center shadow-sm font-medium transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Lưu thay đổi
          </button>
        </div>

        {status && (
          <div className={`p-4 mb-6 rounded-lg flex items-start ${status.type === 'success' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
            {status.type === 'success' ? (
              <CheckCircle className="h-5 w-5 text-green-500 mr-2 mt-0.5" />
            ) : (
              <AlertCircle className="h-5 w-5 text-red-500 mr-2 mt-0.5" />
            )}
            <p className={`text-sm ${status.type === 'success' ? 'text-green-700' : 'text-red-700'}`}>
              {status.message}
            </p>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tên hiển thị</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trạng thái</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vai trò</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tổ chuyên môn</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.map(user => {
                const originalUser = originalUsers.find(u => u.uid === user.uid);
                const isChanged = originalUser && (
                  originalUser.role !== user.role || 
                  originalUser.department !== user.department || 
                  originalUser.status !== user.status
                );

                return (
                  <tr key={user.uid} className={isChanged ? "bg-yellow-50/50 transition-colors" : "transition-colors"}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{user.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">{user.name || 'N/A'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <select
                        value={user.status || 'approved'}
                        onChange={(e) => handleStatusChange(user.uid, e.target.value as any)}
                        className={`block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md ${
                          user.status === 'pending' ? 'text-yellow-600 font-medium' : 
                          user.status === 'rejected' ? 'text-red-600 font-medium' : 
                          'text-green-600 font-medium'
                        }`}
                        disabled={user.email === 'nguyendongnam261189@gmail.com'}
                      >
                        <option value="pending">Chờ duyệt</option>
                        <option value="approved">Đã duyệt</option>
                        <option value="rejected">Từ chối</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <select
                        value={user.role}
                        onChange={(e) => handleRoleChange(user.uid, e.target.value as 'admin' | 'teacher' | 'ttcm')}
                        className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                        disabled={user.email === 'nguyendongnam261189@gmail.com'}
                      >
                        <option value="teacher">Giáo viên</option>
                        <option value="ttcm">Tổ trưởng CM</option>
                        <option value="admin">Quản trị viên</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <select
                        value={user.department || ''}
                        onChange={(e) => handleDepartmentChange(user.uid, e.target.value)}
                        className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md disabled:bg-gray-100 disabled:text-gray-400"
                        disabled={user.role === 'admin'}
                      >
                        <option value="">-- Chọn tổ --</option>
                        {departments.map(dept => (
                          <option key={dept} value={dept}>{dept}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {users.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              Không có dữ liệu người dùng.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
