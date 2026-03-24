import React, { useState, useEffect, useMemo } from 'react';
import { User, Teacher } from '../types';
import { collection, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Users, Save, CheckCircle, AlertCircle, Loader2, Trash2, BellRing, Search, Filter } from 'lucide-react';
import { teacherService } from '../services/teacherService';

type ExtendedUser = User & { teacherName?: string | null };

export const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<ExtendedUser[]>([]);
  const [teachersList, setTeachersList] = useState<Teacher[]>([]); 
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterDept, setFilterDept] = useState('');

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
    const fetchData = async () => {
      setLoading(true);
      try {
        const querySnapshot = await getDocs(collection(db, 'users'));
        const usersData = querySnapshot.docs.map(doc => ({
          uid: doc.id,
          ...doc.data()
        } as ExtendedUser));
        
        setUsers(usersData);

        const allTeachers = await teacherService.getAllTeachers();
        setTeachersList(allTeachers);
      } catch (error) {
        console.error("Error fetching data:", error);
        setStatus({ type: 'error', message: 'Không thể tải danh sách.' });
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // 🔥 BỔ SUNG KIỂU 'manager' VÀ XỬ LÝ XÓA TỔ/TÊN CHO BGH
  const handleRoleChange = (uid: string, role: 'admin' | 'manager' | 'teacher' | 'ttcm') => {
    setUsers(prevUsers => prevUsers.map(user => 
      user.uid === uid ? { 
        ...user, 
        role, 
        department: (role === 'admin' || role === 'manager') ? null : user.department,
        teacherName: (role === 'admin' || role === 'manager') ? null : user.teacherName
      } : user
    ));
  };

  const handleDepartmentChange = (uid: string, department: string) => {
    setUsers(prevUsers => prevUsers.map(user => 
      user.uid === uid ? { ...user, department, teacherName: null } : user
    ));
  };

  const handleTeacherLinkChange = (uid: string, teacherName: string) => {
    setUsers(prevUsers => prevUsers.map(user => 
      user.uid === uid ? { ...user, teacherName } : user
    ));
  };

  const handleStatusChange = (uid: string, newStatus: 'pending' | 'approved' | 'rejected') => {
    setUsers(prevUsers => prevUsers.map(user => 
      user.uid === uid ? { ...user, status: newStatus } : user
    ));
  };

  const handleDeleteUser = async (uid: string, email: string) => {
    if (window.confirm(`⚠️ CẢNH BÁO: Bạn có chắc chắn muốn XÓA tài khoản ${email} khỏi hệ thống không?`)) {
      try {
        await deleteDoc(doc(db, 'users', uid));
        setUsers(prevUsers => prevUsers.filter(user => user.uid !== uid));
        setStatus({ type: 'success', message: `Đã xóa tài khoản ${email} thành công!` });
      } catch (error: any) {
        setStatus({ type: 'error', message: `Lỗi khi xóa: ${error.message}` });
      }
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const updatePromises = users.map(user => {
        const userRef = doc(db, 'users', user.uid);
        return updateDoc(userRef, {
          role: user.role,
          department: user.department || null,
          teacherName: user.teacherName || null,
          status: user.status || 'approved'
        });
      });

      await Promise.all(updatePromises);
      setStatus({ type: 'success', message: 'Đã lưu phân quyền và liên kết thành công!' });
    } catch (error: any) {
      console.error("Error updating users:", error);
      setStatus({ type: 'error', message: `Lỗi khi lưu: ${error.message}` });
    } finally {
      setSaving(false);
    }
  };

  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = user.email.toLowerCase().includes(searchLower) || 
                            (user.name || '').toLowerCase().includes(searchLower);
      
      const matchesDept = filterDept 
        ? (filterDept === 'unassigned' ? !user.department : user.department === filterDept)
        : true;

      return matchesSearch && matchesDept;
    });
  }, [users, searchTerm, filterDept]);

  const pendingUsers = useMemo(() => filteredUsers.filter(u => u.status === 'pending'), [filteredUsers]);
  const processedUsers = useMemo(() => filteredUsers.filter(u => u.status !== 'pending'), [filteredUsers]);

  const groupedUsers = useMemo(() => {
    const groups: Record<string, ExtendedUser[]> = {};
    processedUsers.forEach(user => {
      const groupName = user.department || 'Chưa phân tổ';
      if (!groups[groupName]) groups[groupName] = [];
      groups[groupName].push(user);
    });
    return groups;
  }, [processedUsers]);

  const renderUserTable = (userList: ExtendedUser[], isPendingTable: boolean = false) => (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className={isPendingTable ? "bg-amber-50" : "bg-gray-50"}>
          <tr>
            <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Email</th>
            <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Trạng thái</th>
            <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Vai trò</th>
            <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Tổ chuyên môn</th>
            <th className="px-4 py-3 text-left text-xs font-bold text-indigo-600 uppercase tracking-wider">Liên kết Tên TKB</th>
            <th className="px-4 py-3 text-center text-xs font-bold text-red-500 uppercase tracking-wider">Xóa</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {userList.map(user => {
            const availableTeachersInDept = teachersList
                .filter(t => t.group === user.department)
                .sort((a,b) => a.name.localeCompare(b.name, 'vi'));

            return (
              <tr key={user.uid} className={isPendingTable ? "bg-amber-50/20 hover:bg-amber-50/50" : "hover:bg-gray-50 transition-colors"}>
                <td className="px-4 py-4 whitespace-nowrap">
                  <div className="text-sm font-bold text-gray-900">{user.email}</div>
                  <div className="text-xs text-gray-500">{user.name || 'N/A'}</div>
                </td>
                <td className="px-4 py-4 whitespace-nowrap">
                  <select
                    value={user.status || 'approved'}
                    onChange={(e) => handleStatusChange(user.uid, e.target.value as any)}
                    className={`block w-full pl-3 pr-8 py-2 text-sm border-gray-300 focus:ring-indigo-500 focus:border-indigo-500 rounded-md shadow-sm ${
                      user.status === 'pending' ? 'text-amber-700 font-bold bg-amber-100 border-amber-300' : 
                      user.status === 'rejected' ? 'text-red-600 font-bold bg-red-50' : 
                      'text-green-600 font-bold bg-green-50'
                    }`}
                    disabled={user.email === 'nguyendongnam261189@gmail.com'}
                  >
                    <option value="pending">Chờ duyệt</option>
                    <option value="approved">Đã duyệt</option>
                    <option value="rejected">Từ chối</option>
                  </select>
                </td>
                <td className="px-4 py-4 whitespace-nowrap">
                  <select
                    value={user.role}
                    // 🔥 BỔ SUNG 'manager' VÀO ĐÂY
                    onChange={(e) => handleRoleChange(user.uid, e.target.value as 'admin' | 'manager' | 'teacher' | 'ttcm')}
                    className="block w-full pl-3 pr-8 py-2 text-sm border-gray-300 focus:ring-indigo-500 focus:border-indigo-500 rounded-md font-medium"
                    disabled={user.email === 'nguyendongnam261189@gmail.com'}
                  >
                    <option value="teacher">Giáo viên</option>
                    <option value="ttcm">Tổ trưởng CM</option>
                    <option value="manager">Ban Giám hiệu</option>
                    <option value="admin">Quản trị viên</option>
                  </select>
                </td>
                <td className="px-4 py-4 whitespace-nowrap">
                  <select
                    value={user.department || ''}
                    onChange={(e) => handleDepartmentChange(user.uid, e.target.value)}
                    className="block w-full pl-3 pr-8 py-2 text-sm border-gray-300 focus:ring-indigo-500 focus:border-indigo-500 rounded-md disabled:bg-gray-100 disabled:text-gray-400"
                    // 🔥 KHÓA CHỌN TỔ NẾU LÀ ADMIN HOẶC MANAGER
                    disabled={user.role === 'admin' || user.role === 'manager'}
                  >
                    <option value="">-- Chọn tổ --</option>
                    {departments.map(dept => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-4 whitespace-nowrap bg-indigo-50/10">
                  <select
                    value={user.teacherName || ''}
                    onChange={(e) => handleTeacherLinkChange(user.uid, e.target.value)}
                    className={`block w-full pl-3 pr-8 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500 rounded-md shadow-sm border ${!user.teacherName && user.role !== 'admin' && user.role !== 'manager' ? 'border-red-300 bg-red-50 text-red-700' : 'border-indigo-300 bg-white text-indigo-700 font-bold'}`}
                    // 🔥 KHÓA CHỌN TÊN GV NẾU LÀ ADMIN HOẶC MANAGER
                    disabled={user.role === 'admin' || user.role === 'manager' || !user.department}
                  >
                    <option value="">{user.department ? '-- Chọn tên GV --' : '-- Chọn Tổ trước --'}</option>
                    {availableTeachersInDept.map(t => (
                      <option key={t.name} value={t.name}>{t.name}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-4 whitespace-nowrap text-center">
                  <button
                    onClick={() => handleDeleteUser(user.uid, user.email)}
                    disabled={user.email === 'nguyendongnam261189@gmail.com'}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                    title="Xóa tài khoản"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 sticky top-0 z-10">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 flex items-center">
              <Users className="mr-2 text-indigo-600" /> Quản lý Người dùng & Phân tổ
            </h2>
            <p className="text-sm text-gray-500 mt-1">Tổng cộng: {users.length} tài khoản trong hệ thống</p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white px-5 py-2.5 rounded-lg flex items-center shadow-md font-bold transition-all transform hover:scale-105 active:scale-95"
          >
            {saving ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Save className="w-5 h-5 mr-2" />}
            Lưu tất cả thay đổi
          </button>
        </div>

        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <input
              type="text"
              placeholder="Tìm kiếm theo email hoặc tên hiển thị..."
              className="pl-10 pr-4 py-2.5 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <select
              className="pl-10 pr-8 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 shadow-sm min-w-[220px] bg-white"
              value={filterDept}
              onChange={(e) => setFilterDept(e.target.value)}
            >
              <option value="">Tất cả tổ chuyên môn</option>
              {departments.map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
              <option value="unassigned" className="font-bold text-red-600">-- Chưa phân tổ --</option>
            </select>
          </div>
        </div>

        {status && (
          <div className={`mt-6 p-4 rounded-lg flex items-start ${status.type === 'success' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
            {status.type === 'success' ? <CheckCircle className="h-5 w-5 text-green-500 mr-2 mt-0.5" /> : <AlertCircle className="h-5 w-5 text-red-500 mr-2 mt-0.5" />}
            <p className={`text-sm font-medium ${status.type === 'success' ? 'text-green-700' : 'text-red-700'}`}>
              {status.message}
            </p>
          </div>
        )}
      </div>

      {pendingUsers.length > 0 && (
        <div className="bg-white border-2 border-amber-300 rounded-xl overflow-hidden shadow-lg animate-in fade-in slide-in-from-bottom-4">
          <div className="bg-amber-100 px-4 py-3 border-b border-amber-200 flex justify-between items-center">
            <h3 className="font-bold text-amber-900 text-lg flex items-center">
              <BellRing className="w-5 h-5 mr-2 text-amber-600 animate-bounce" />
              Có {pendingUsers.length} tài khoản mới đang chờ duyệt!
            </h3>
          </div>
          {renderUserTable(pendingUsers, true)}
        </div>
      )}

      <div className="space-y-6">
        {Object.keys(groupedUsers).sort().map((groupName) => (
          <div key={groupName} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <div className="bg-indigo-50/50 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
              <h3 className="font-bold text-indigo-900 text-lg flex items-center">
                {groupName}
              </h3>
              <span className="bg-indigo-100 text-indigo-800 text-xs font-bold px-2.5 py-1 rounded-full border border-indigo-200">
                {groupedUsers[groupName].length} người
              </span>
            </div>
            {renderUserTable(groupedUsers[groupName])}
          </div>
        ))}

        {processedUsers.length === 0 && pendingUsers.length === 0 && (
          <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-300">
            {(searchTerm || filterDept) ? 'Không tìm thấy tài khoản nào khớp với bộ lọc.' : 'Chưa có dữ liệu người dùng.'}
          </div>
        )}
      </div>
    </div>
  );
};
