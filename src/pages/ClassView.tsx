import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Schedule, Teacher } from '../types';
import { scheduleService } from '../services/scheduleService';
import { teacherService } from '../services/teacherService';
import { Search, Calendar, Layers, UserCheck, Filter, Star, Phone, MessageCircle, Video, X, PhoneCall, Copy, Check, Download, Loader2, Image as ImageIcon } from 'lucide-react';
import { toBlob } from 'html-to-image'; 

export const ClassView: React.FC<{ teacherName?: string | null }> = ({ teacherName }) => {
  const [allSchedules, setAllSchedules] = useState<Schedule[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]); 
  
  const [searchClass, setSearchClass] = useState('');
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [filterGrade, setFilterGrade] = useState<string>('');

  const [versions, setVersions] = useState<string[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<string>('');

  const [selectedSlot, setSelectedSlot] = useState<Schedule | null>(null);

  // 🔥 STATES QUẢN LÝ QUY TRÌNH XUẤT ẢNH (2 BƯỚC AN TOÀN)
  const tkbRef = useRef<HTMLDivElement>(null);
  const contactsRef = useRef<HTMLDivElement>(null);
  
  const [tkbBlob, setTkbBlob] = useState<Blob | null>(null);
  const [contactsBlob, setContactsBlob] = useState<Blob | null>(null);
  
  const [isGeneratingTkb, setIsGeneratingTkb] = useState(false);
  const [isGeneratingContacts, setIsGeneratingContacts] = useState(false);
  
  const [tkbCopySuccess, setTkbCopySuccess] = useState(false);
  const [contactsCopySuccess, setContactsCopySuccess] = useState(false);

  // Reset Blobs khi đổi lớp hoặc đổi phiên bản
  useEffect(() => {
    setTkbBlob(null);
    setContactsBlob(null);
    setTkbCopySuccess(false);
    setContactsCopySuccess(false);
  }, [selectedClass, selectedVersion]);

  useEffect(() => {
    const fetchData = async () => {
      const schedulesData = await scheduleService.getAllSchedules();
      const teachersData = await teacherService.getAllTeachers(); 
      
      setAllSchedules(schedulesData);
      setTeachers(teachersData);
      
      const uniqueVersions = Array.from(new Set(schedulesData.map(s => s.versionName || 'Mặc định'))).sort().reverse();
      setVersions(uniqueVersions);
      
      if (uniqueVersions.length > 0 && !selectedVersion) {
        setSelectedVersion(uniqueVersions[0]); 
      }
    };
    fetchData();
  }, []);

  const currentSchedules = useMemo(() => {
    return allSchedules.filter(s => (s.versionName || 'Mặc định') === selectedVersion);
  }, [allSchedules, selectedVersion]);

  const isHomeroomSubject = (subject: string) => {
    const s = (subject || '').toUpperCase();
    return s.includes('HDTN') || s.includes('HĐTN') || s.includes('CHÀO CỜ') || s.includes('CC-') || s.includes('SHL') || s.includes('SINH HOẠT');
  };

  const myHomeroomClasses = useMemo(() => {
    if (!teacherName) return [];
    const hrClasses = new Set<string>();
    currentSchedules.forEach(s => {
      if (s.giao_vien === teacherName && isHomeroomSubject(s.mon)) {
        if (s.lop) s.lop.split(', ').forEach(c => hrClasses.add(c.trim()));
      }
    });
    return Array.from(hrClasses).sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }));
  }, [currentSchedules, teacherName]);

  const classes = useMemo(() => {
    const classSet = new Set<string>();
    currentSchedules.forEach(s => {
      if (s.lop) {
        s.lop.split(', ').forEach(c => classSet.add(c.trim()));
      }
    });
    return Array.from(classSet).filter(Boolean).sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }));
  }, [currentSchedules]);

  const filteredClasses = classes.filter(c => {
    const matchSearch = c.toLowerCase().includes(searchClass.toLowerCase());
    const matchGrade = filterGrade ? c.startsWith(filterGrade + '.') || c.startsWith(filterGrade + '/') : true;
    return matchSearch && matchGrade;
  });

  const groupedClasses = useMemo(() => {
    const groups: Record<string, string[]> = {};
    filteredClasses.forEach(c => {
      const grade = c.split(/[./]/)[0]; 
      const groupName = `Khối ${grade}`;
      if (!groups[groupName]) groups[groupName] = [];
      groups[groupName].push(c);
    });
    
    return Object.keys(groups).sort((a, b) => a.localeCompare(b, 'vi', { numeric: true })).map(key => ({
      grade: key,
      classes: groups[key]
    }));
  }, [filteredClasses]);

  const getScheduleForClass = (className: string) => {
    return currentSchedules.filter(s => 
      s.lop.split(', ').map(c => c.trim()).includes(className)
    );
  };

  const getHomeroomTeacher = (classSchedules: Schedule[]): string => {
    for (const s of classSchedules) {
      if (isHomeroomSubject(s.mon) && s.giao_vien !== 'Chưa rõ') {
        return s.giao_vien;
      }
    }
    return 'Chưa có thông tin';
  };

  const formatZaloLink = (phone?: string) => {
    if (!phone) return '#';
    let cleanPhone = phone.replace(/[\s.-]/g, '');
    if (cleanPhone.startsWith('0')) {
      cleanPhone = '84' + cleanPhone.substring(1);
    }
    return `https://zalo.me/${cleanPhone}`;
  };

  // ============================================================================
  // 🔥 QUY TRÌNH XUẤT ẢNH: BƯỚC 1 - TẠO ẢNH BẢO TOÀN CHIỀU RỘNG
  // ============================================================================
  const generateImageBlob = async (ref: React.RefObject<HTMLDivElement>, type: 'TKB' | 'DanhBa') => {
    if (!ref.current) return;
    
    if (type === 'TKB') setIsGeneratingTkb(true);
    else setIsGeneratingContacts(true);

    try {
      await new Promise(resolve => setTimeout(resolve, 300)); 
      
      // Lấy chiều rộng thực tế của nội dung bên trong (chống cắt ảnh trên điện thoại)
      // Ép tối thiểu 800px để ảnh luôn to, rõ ràng
      const scrollWidth = Math.max(ref.current.scrollWidth, 800);

      const blob = await toBlob(ref.current, {
        backgroundColor: '#ffffff',
        pixelRatio: 2, 
        width: scrollWidth, // Ép camera phải rộng ra bằng scrollWidth
        style: { 
          transform: 'none', 
          margin: '0',
          width: `${scrollWidth}px`, // Ép phần tử con phải giãn ra hết cỡ
          maxWidth: 'none'
        }
      });

      if (blob) {
        if (type === 'TKB') setTkbBlob(blob);
        else setContactsBlob(blob);
      } else {
        throw new Error("Không thể trích xuất dữ liệu ảnh.");
      }
    } catch (err: any) {
      alert(`Lỗi tạo ảnh: ${err.message}`);
    } finally {
      if (type === 'TKB') setIsGeneratingTkb(false);
      else setIsGeneratingContacts(false);
    }
  };

  // ============================================================================
  // 🔥 QUY TRÌNH XUẤT ẢNH: BƯỚC 2 - COPY VÀO BỘ NHỚ TẠM
  // ============================================================================
  const handleCopyImage = async (blob: Blob, type: 'TKB' | 'DanhBa') => {
    try {
      const item = new ClipboardItem({ 'image/png': blob });
      await navigator.clipboard.write([item]);
      
      if (type === 'TKB') {
        setTkbCopySuccess(true);
        setTimeout(() => setTkbCopySuccess(false), 3000);
      } else {
        setContactsCopySuccess(true);
        setTimeout(() => setContactsCopySuccess(false), 3000);
      }
    } catch (error) {
      console.error('Lỗi clipboard:', error);
      alert("Trình duyệt hoặc điện thoại của bạn đang chặn chức năng Copy ảnh trực tiếp. Vui lòng sử dụng nút TẢI ẢNH XUỐNG bên cạnh nhé!");
    }
  };

  // ============================================================================
  // 🔥 QUY TRÌNH XUẤT ẢNH: BƯỚC DỰ PHÒNG - TẢI ẢNH XUỐNG
  // ============================================================================
  const handleDownloadImage = (blob: Blob, type: 'TKB' | 'DanhBa') => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `${type}_Lop_${String(selectedClass).replace(/\./g, '_')}.png`;
    link.href = url;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); 
  };


  const renderScheduleGrid = (classSchedules: Schedule[]) => {
    const days = [2, 3, 4, 5, 6, 7];
    const periods = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    return (
      <div className="overflow-x-auto mt-4 bg-white rounded-xl shadow-sm border border-emerald-200 relative z-10 w-full">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-emerald-50/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-bold text-emerald-800 uppercase tracking-wider border-r">Tiết \ Thứ</th>
              {days.map(day => (
                <th key={day} className="px-4 py-3 text-center text-xs font-bold text-emerald-800 uppercase tracking-wider border-r">Thứ {day}</th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {periods.map(period => (
              <tr key={period} className={period === 5 ? 'border-b-4 border-emerald-100' : ''}>
                <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-gray-700 border-r bg-gray-50">
                  Tiết {period <= 5 ? period : period - 5} {period <= 5 ? '(Sáng)' : '(Chiều)'}
                </td>
                {days.map(day => {
                  const session = period <= 5 ? 'Sáng' : 'Chiều';
                  const adjustedPeriod = period <= 5 ? period : period - 5;
                  const slot = classSchedules.find(s => s.thu === day && s.tiet === adjustedPeriod && s.buoi === session);
                  const cleanPhong = slot?.phong ? String(slot.phong).trim() : '';
                  const hasRoom = cleanPhong !== '' && cleanPhong.toLowerCase() !== 'null' && cleanPhong.toLowerCase() !== 'undefined';
                  
                  const isClickable = slot && slot.giao_vien !== 'Chưa rõ';

                  return (
                    <td 
                      key={`${day}-${period}`} 
                      onClick={() => isClickable && setSelectedSlot(slot)}
                      className={`px-4 py-3 whitespace-nowrap text-sm text-center border-r transition-all
                        ${slot ? 'bg-emerald-50/40' : 'bg-gray-50/30'}
                        ${isClickable ? 'cursor-pointer hover:bg-emerald-100 hover:shadow-inner ring-1 ring-transparent hover:ring-emerald-300' : ''}
                      `}
                      title={isClickable ? 'Bấm để xem liên lạc Giáo viên' : ''}
                    >
                      {slot ? (
                        <div className="flex flex-col items-center">
                          <span className="font-bold text-emerald-800 text-base">{slot.mon}</span>
                          <span className="text-xs font-medium text-emerald-950 mt-1 flex items-center">
                            {slot.giao_vien}
                          </span>
                          {hasRoom && <span className="text-[10px] text-gray-500 mt-0.5 bg-white px-1.5 rounded border border-gray-200 shadow-sm">P.{cleanPhong}</span>}
                        </div>
                      ) : <span className="text-gray-300 text-xs italic">-</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderContactModal = () => {
    if (!selectedSlot) return null;
    
    const teacherInfo = teachers.find(t => t.name === selectedSlot.giao_vien);
    const phone = teacherInfo?.phone;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={() => setSelectedSlot(null)}></div>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden relative z-10 animate-in zoom-in-95 duration-200">
          
          <div className="bg-gradient-to-r from-emerald-500 to-teal-600 p-5 text-white text-center relative">
            <button onClick={() => setSelectedSlot(null)} className="absolute top-3 right-3 text-white/80 hover:text-white bg-black/10 hover:bg-black/20 rounded-full p-1.5 transition-colors">
              <X className="w-5 h-5" />
            </button>
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center font-black text-3xl text-emerald-600 mx-auto mb-3 shadow-md">
              {String(selectedSlot.giao_vien).split(' ').pop()?.charAt(0).toUpperCase()}
            </div>
            <h3 className="text-xl font-bold">{selectedSlot.giao_vien}</h3>
            <p className="text-emerald-100 text-sm mt-1">{teacherInfo?.group || 'Giáo viên bộ môn'}</p>
          </div>

          <div className="p-5">
            <div className="flex items-center justify-center bg-gray-50 rounded-lg p-3 mb-5 border border-gray-100">
              <PhoneCall className="w-4 h-4 text-gray-400 mr-2" />
              <span className="font-bold text-gray-700 tracking-wider">
                {phone ? phone : 'Chưa cập nhật SĐT'}
              </span>
            </div>

            {phone ? (
              <div className="grid grid-cols-3 gap-2">
                <a href={`tel:${phone}`} className="flex flex-col items-center justify-center bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 py-3 rounded-xl transition-colors active:scale-95">
                  <Phone className="w-6 h-6 mb-1.5" />
                  <span className="text-[10px] font-bold uppercase">Gọi điện</span>
                </a>
                <a href={formatZaloLink(phone)} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center justify-center bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 py-3 rounded-xl transition-colors active:scale-95">
                  <MessageCircle className="w-6 h-6 mb-1.5" />
                  <span className="text-[10px] font-bold uppercase">Nhắn Zalo</span>
                </a>
                <a href={formatZaloLink(phone)} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center justify-center bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 py-3 rounded-xl transition-colors active:scale-95">
                  <Video className="w-6 h-6 mb-1.5" />
                  <span className="text-[10px] font-bold uppercase">Gọi Zalo</span>
                </a>
              </div>
            ) : (
              <div className="text-center text-sm text-gray-500 italic pb-2">
                Không thể thực hiện cuộc gọi vì giáo viên này chưa cập nhật số điện thoại trên hệ thống.
              </div>
            )}
            
            <div className="mt-5 pt-4 border-t border-gray-100 flex justify-between items-center text-xs text-gray-400 font-medium">
              <span>Đang dạy tiết: <strong className="text-gray-600">{selectedSlot.mon}</strong></span>
              <span>Lớp: <strong className="text-gray-600">{String(selectedSlot.lop).replace(/\./g, '/')}</strong></span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // 🔥 TEMPLATE ẨN ĐỂ CHỤP ẢNH DANH BẠ
  const renderHiddenContactsTemplate = () => {
    if (!selectedClass) return null;
    const classScheds = getScheduleForClass(selectedClass);
    const uniqueTeacherNames = Array.from(new Set(classScheds.map(s => s.giao_vien).filter(n => n !== 'Chưa rõ'))).sort();

    return (
      <div style={{ position: 'absolute', left: '-9999px', top: '-9999px' }}>
        <div ref={contactsRef} className="bg-white p-8 w-[900px] border border-gray-200" style={{ fontFamily: "'Inter', sans-serif" }}>
          
          <div className="text-center mb-8 border-b-2 border-emerald-600 pb-6">
            <h2 className="text-3xl font-black text-emerald-900 mb-2 uppercase">DANH BẠ GIÁO VIÊN BỘ MÔN</h2>
            <div className="inline-flex items-center justify-center bg-emerald-100 px-6 py-2 rounded-full border border-emerald-300">
              <h3 className="text-2xl font-bold text-emerald-800 tracking-wider">
                LỚP {String(selectedClass).replace(/\./g, '/')}
              </h3>
            </div>
            <p className="text-gray-500 mt-4 font-medium text-lg">Áp dụng từ phiên bản: {selectedVersion}</p>
          </div>
          
          <table className="w-full border-collapse border border-gray-300">
            <thead>
              <tr className="bg-emerald-700 text-white">
                <th className="border border-emerald-800 p-4 text-center w-16 text-lg">STT</th>
                <th className="border border-emerald-800 p-4 text-left font-bold text-lg w-1/4">MÔN DẠY</th>
                <th className="border border-emerald-800 p-4 text-left font-bold text-lg w-1/3">HỌ TÊN GIÁO VIÊN</th>
                <th className="border border-emerald-800 p-4 text-center font-bold text-lg">SỐ ĐIỆN THOẠI (ZALO)</th>
              </tr>
            </thead>
            <tbody>
              {uniqueTeacherNames.map((tName, idx) => {
                const tInfo = teachers.find(t => t.name === tName);
                const phone = tInfo?.phone ? tInfo.phone : '';
                const subjects = Array.from(new Set(classScheds.filter(s => s.giao_vien === tName).map(s => s.mon))).join(', ');
                const isHR = getHomeroomTeacher(classScheds) === tName;
                
                return (
                  <tr key={tName} className={idx % 2 === 0 ? 'bg-emerald-50/40' : 'bg-white'}>
                    <td className="border border-gray-300 p-4 text-center font-bold text-gray-500 text-lg">{idx + 1}</td>
                    <td className="border border-gray-300 p-4 font-bold text-emerald-800 text-lg">{subjects}</td>
                    <td className="border border-gray-300 p-4 font-bold text-gray-800 text-xl flex items-center">
                      {tName} {isHR && <span className="ml-3 bg-amber-100 text-amber-700 text-sm font-black px-2 py-1 rounded border border-amber-300">GVCN</span>}
                    </td>
                    <td className="border border-gray-300 p-4 text-center font-black text-indigo-700 tracking-wider text-2xl">
                      {phone || <span className="text-gray-300 text-base italic font-normal">Chưa cập nhật</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          
          <div className="mt-8 text-right text-gray-400 italic text-sm">
             Được xuất từ Hệ thống TKB Manager lúc {new Date().toLocaleTimeString('vi-VN')} ngày {new Date().toLocaleDateString('vi-VN')}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto relative">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 relative overflow-hidden">
        <div className="flex flex-col lg:flex-row justify-between lg:items-center mb-6 border-b pb-4 border-gray-100 gap-4">
          <h2 className="text-2xl font-bold text-gray-800 flex items-center">
            <Calendar className="mr-2 text-emerald-600 h-7 w-7" /> Tra cứu TKB theo Lớp
          </h2>

          <div className="flex items-center bg-emerald-50 p-2 rounded-xl border border-emerald-100 shadow-sm self-start lg:self-center">
            <span className="text-emerald-800 font-bold text-sm mr-3 flex items-center shrink-0">
              <Layers className="w-4 h-4 mr-1.5" /> Phiên bản:
            </span>
            <select 
              className="bg-white border-none rounded-lg text-sm font-bold text-gray-800 focus:ring-2 focus:ring-emerald-500 py-1.5 px-3 min-w-[150px] shadow-sm outline-none"
              value={selectedVersion}
              onChange={(e) => {
                setSelectedVersion(e.target.value);
                setSelectedClass(null); 
              }}
            >
              {versions.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <input
              type="text"
              placeholder="Tìm tên lớp (VD: 6/11)..."
              className="pl-10 pr-4 py-2.5 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 text-sm font-medium shadow-sm outline-none"
              value={searchClass}
              onChange={(e) => setSearchClass(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="text-gray-400 w-5 h-5 ml-2 hidden md:block" />
            <select
              className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 text-sm font-bold text-gray-700 shadow-sm outline-none bg-white"
              value={filterGrade}
              onChange={(e) => setFilterGrade(e.target.value)}
            >
              <option value="">Hiển thị Tất cả các Khối</option>
              <option value="6">Chỉ xem Khối 6</option>
              <option value="7">Chỉ xem Khối 7</option>
              <option value="8">Chỉ xem Khối 8</option>
              <option value="9">Chỉ xem Khối 9</option>
            </select>
          </div>
        </div>

        {!selectedClass && (
          <div className="space-y-8 animate-in fade-in duration-300">
            {myHomeroomClasses.length > 0 && !searchClass && !filterGrade && (
              <div className="bg-amber-50 rounded-xl p-5 border border-amber-200 shadow-sm">
                <div className="flex items-center mb-4 border-b border-amber-200/50 pb-2">
                  <h3 className="text-lg font-black text-amber-800 flex items-center">
                    <Star className="w-5 h-5 mr-2 text-amber-500 fill-amber-500" /> 
                    Lớp Chủ nhiệm của tôi
                  </h3>
                </div>
                <div className="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-8 gap-3">
                  {myHomeroomClasses.map(className => (
                    <button
                      key={className}
                      onClick={() => setSelectedClass(className)}
                      className="p-3 text-sm font-bold text-amber-900 bg-white border-2 border-amber-300 rounded-xl shadow-sm hover:bg-amber-100 hover:border-amber-400 hover:-translate-y-0.5 transition-all text-center relative overflow-hidden"
                    >
                      <div className="absolute top-0 left-0 w-full h-1 bg-amber-400"></div>
                      {String(className).replace(/\./g, '/')}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {groupedClasses.map(group => (
              <div key={group.grade} className="bg-gray-50 rounded-xl p-5 border border-gray-100">
                <div className="flex items-center mb-4 border-b border-gray-200 pb-2">
                  <h3 className="text-lg font-black text-gray-700">{group.grade}</h3>
                  <span className="ml-3 px-2.5 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full">
                    {group.classes.length} lớp
                  </span>
                </div>
                
                <div className="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-8 gap-3">
                  {group.classes.map(className => (
                    <button
                      key={className}
                      onClick={() => setSelectedClass(className)}
                      className="p-3 text-sm font-bold text-emerald-900 bg-white border border-gray-200 rounded-xl shadow-sm hover:bg-emerald-50 hover:border-emerald-400 hover:shadow-md hover:-translate-y-0.5 transition-all text-center"
                    >
                      {String(className).replace(/\./g, '/')}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {groupedClasses.length === 0 && (
              <div className="text-center py-12 text-gray-400 italic bg-gray-50 rounded-xl border border-dashed border-gray-200">
                Không tìm thấy dữ liệu lớp học nào khớp với tìm kiếm của bạn.
              </div>
            )}
          </div>
        )}

        {selectedClass && (
          <div className="animate-in slide-in-from-right-4 duration-300 relative z-10">
            
            {/* THIẾT LẬP THANH ĐIỀU KHIỂN & NÚT COPY KIỂU MỚI (2 BƯỚC) */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 gap-4 bg-gray-50 p-3 rounded-xl border border-gray-200">
              <button 
                onClick={() => setSelectedClass(null)}
                className="text-sm text-gray-700 hover:text-gray-900 bg-white border border-gray-300 hover:bg-gray-100 px-5 py-2.5 rounded-lg transition-colors font-bold shadow-sm whitespace-nowrap w-full lg:w-auto"
              >
                ← Trở lại
              </button>

              <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
                
                {/* TOOL: ẢNH TKB */}
                <div className="flex bg-white p-1 rounded-lg border border-emerald-200 shadow-sm w-full sm:w-auto">
                  {!tkbBlob ? (
                    <button 
                      onClick={() => generateImageBlob(tkbRef, 'TKB')}
                      disabled={isGeneratingTkb || isGeneratingContacts}
                      className="w-full bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-4 py-2 rounded-md text-sm font-bold transition-all disabled:opacity-50 flex justify-center items-center"
                    >
                      {isGeneratingTkb ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ImageIcon className="w-4 h-4 mr-2" />}
                      Tạo ảnh TKB
                    </button>
                  ) : (
                    <div className="flex w-full animate-in fade-in zoom-in-95 duration-200">
                      <button 
                        onClick={() => handleCopyImage(tkbBlob, 'TKB')}
                        className={`flex-1 px-4 py-2 rounded-l-md text-sm font-bold text-white transition-all flex justify-center items-center border-r border-green-600
                          ${tkbCopySuccess ? 'bg-green-600' : 'bg-emerald-600 hover:bg-emerald-700'}
                        `}
                      >
                        {tkbCopySuccess ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                        {tkbCopySuccess ? 'Đã Copy TKB!' : 'Copy Zalo'}
                      </button>
                      <button 
                        onClick={() => handleDownloadImage(tkbBlob, 'TKB')}
                        className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-r-md transition-colors"
                        title="Tải ảnh xuống"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                {/* TOOL: ẢNH DANH BẠ */}
                <div className="flex bg-white p-1 rounded-lg border border-blue-200 shadow-sm w-full sm:w-auto">
                  {!contactsBlob ? (
                    <button 
                      onClick={() => generateImageBlob(contactsRef, 'DanhBa')}
                      disabled={isGeneratingTkb || isGeneratingContacts}
                      className="w-full bg-blue-50 hover:bg-blue-100 text-blue-700 px-4 py-2 rounded-md text-sm font-bold transition-all disabled:opacity-50 flex justify-center items-center"
                    >
                      {isGeneratingContacts ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PhoneCall className="w-4 h-4 mr-2" />}
                      Tạo ảnh Danh bạ
                    </button>
                  ) : (
                    <div className="flex w-full animate-in fade-in zoom-in-95 duration-200">
                      <button 
                        onClick={() => handleCopyImage(contactsBlob, 'DanhBa')}
                        className={`flex-1 px-4 py-2 rounded-l-md text-sm font-bold text-white transition-all flex justify-center items-center border-r border-blue-700
                          ${contactsCopySuccess ? 'bg-green-500' : 'bg-[#0068FF] hover:bg-blue-600'}
                        `}
                      >
                        {contactsCopySuccess ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                        {contactsCopySuccess ? 'Đã Copy Danh Bạ!' : 'Copy Zalo'}
                      </button>
                      <button 
                        onClick={() => handleDownloadImage(contactsBlob, 'DanhBa')}
                        className="px-3 py-2 bg-[#0068FF] hover:bg-blue-600 text-white rounded-r-md transition-colors"
                        title="Tải ảnh xuống"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

              </div>
            </div>

            {/* KHUNG NÀY SẼ ĐƯỢC CHỤP ẢNH LẠI BẰNG HTML-TO-IMAGE - TKB */}
            <div ref={tkbRef} className="bg-white p-4 sm:p-6 rounded-2xl border border-gray-200 shadow-sm relative overflow-hidden inline-block min-w-full">
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 opacity-[0.02] pointer-events-none">
                <Calendar className="w-96 h-96" />
              </div>

              <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 relative z-10">
                <div>
                  <h3 className="text-2xl sm:text-3xl font-black text-emerald-800 flex items-center tracking-tight">
                    THỜI KHÓA BIỂU LỚP {String(selectedClass).replace(/\./g, '/')} 
                  </h3>
                  <div className="flex flex-wrap items-center mt-3 gap-3">
                    <span className="text-sm font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100 shadow-sm">
                      Phiên bản: {selectedVersion}
                    </span>
                    <div className="text-sm font-bold text-gray-700 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200 shadow-sm flex items-center">
                      <UserCheck className="w-4 h-4 mr-1.5 text-gray-500" />
                      GVCN: <span className="ml-1 uppercase text-gray-900">{getHomeroomTeacher(getScheduleForClass(selectedClass))}</span>
                    </div>
                  </div>
                </div>
              </div>
              
              {renderScheduleGrid(getScheduleForClass(selectedClass))}
              
              <div className="mt-5 text-right text-[11px] text-gray-400 italic relative z-10 font-medium">
                * Cập nhật lúc {new Date().toLocaleTimeString('vi-VN')} ngày {new Date().toLocaleDateString('vi-VN')}
              </div>
            </div>

          </div>
        )}
      </div>

      {/* Render cửa sổ Liên hệ Khẩn cấp */}
      {renderContactModal()}

      {/* RENDER BẢNG ẨN SAU HẬU TRƯỜNG ĐỂ CHỤP ẢNH */}
      {renderHiddenContactsTemplate()}

    </div>
  );
};
