import React, { useState, useEffect, useRef } from 'react';
import { Schedule, Teacher } from '../types';
import { scheduleService } from '../services/scheduleService';
import { teacherService } from '../services/teacherService';
import { Users, Search, CheckCircle, AlertCircle, Calendar, Printer, X, Copy, Check, Download, Image as ImageIcon, Loader2, ShieldAlert } from 'lucide-react';
import { normalizeSubjectName } from '../utils/subjectUtils';
import { toBlob } from 'html-to-image'; 

interface Assignment {
  id: string;
  absentTeacher: string;
  day: number;
  session: 'Sáng' | 'Chiều';
  period: number;
  className: string;
  subject: string;
  substituteTeacher: string;
  notes: string;
}

interface ActiveSlot {
  absentTeacher: string;
  day: number;
  session: 'Sáng' | 'Chiều';
  period: number;
  className: string;
  subject: string;
}

export const SubstituteTeacher: React.FC<{ role?: 'admin' | 'teacher' | 'ttcm' | null, department?: string | null }> = ({ role, department }) => {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  
  const [selectedAbsentTeachers, setSelectedAbsentTeachers] = useState<string[]>([]);
  const [assignments, setAssignments] = useState<Record<string, Assignment>>({});
  
  const [activeSlot, setActiveSlot] = useState<ActiveSlot | null>(null);
  const [selectedSub, setSelectedSub] = useState<string | null>(null);
  const [hoveredSub, setHoveredSub] = useState<string | null>(null);
  const [subNotes, setSubNotes] = useState('');
  
  const [isExporting, setIsExporting] = useState(false);
  const [exportTitle, setExportTitle] = useState('PHÂN CÔNG DẠY THAY');
  
  const getDefaultDateString = () => {
    const today = new Date();
    const day = today.getDate().toString().padStart(2, '0');
    const month = (today.getMonth() + 1).toString().padStart(2, '0');
    const year = today.getFullYear();
    return `Ngày ${day} tháng ${month} năm ${year}`;
  };
  
  const [exportDate, setExportDate] = useState(() => getDefaultDateString());

  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedBlob, setGeneratedBlob] = useState<Blob | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  // CHẶN TÀI KHOẢN GIÁO VIÊN
  const isTeacherRole = role === 'teacher';

  useEffect(() => {
    setGeneratedBlob(null);
    setCopySuccess(false);
  }, [assignments, exportTitle, exportDate]);

  useEffect(() => {
    // Nếu là giáo viên, không cần tải data làm gì cho nặng máy
    if (isTeacherRole) return;

    const fetchData = async () => {
      const allSchedules = await scheduleService.getAllSchedules();
      const allTeachers = await teacherService.getAllTeachers();
      setSchedules(allSchedules);
      setTeachers(allTeachers);
    };
    fetchData();
  }, [isTeacherRole]);

  // NẾU LÀ TÀI KHOẢN GIÁO VIÊN -> KHÔNG CHO PHÉP TRUY CẬP TRANG NÀY
  if (isTeacherRole) {
    return (
        <div className="flex flex-col items-center justify-center h-96 bg-white rounded-xl shadow-sm border border-gray-200 p-8 max-w-2xl mx-auto mt-10">
            <ShieldAlert className="w-20 h-20 text-red-500 mb-6" />
            <h2 className="text-3xl font-bold text-gray-800 mb-3 text-center">Truy cập bị từ chối</h2>
            <p className="text-lg text-gray-600 text-center">
                Tính năng <span className="font-semibold text-indigo-600">Phân công Dạy thay</span> chỉ dành cho Ban giám hiệu (Admin) hoặc Tổ trưởng/Tổ phó chuyên môn.
            </p>
            <p className="text-sm text-gray-400 mt-6 italic">Tài khoản của bạn hiện tại là: Giáo viên bộ môn.</p>
        </div>
    );
  }

  const handleAddAbsentTeacher = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val && !selectedAbsentTeachers.includes(val)) {
      setSelectedAbsentTeachers([...selectedAbsentTeachers, val]);
    }
    e.target.value = '';
  };

  const handleRemoveAbsentTeacher = (name: string) => {
    setSelectedAbsentTeachers(selectedAbsentTeachers.filter(t => t !== name));
    const newAssignments = { ...assignments };
    let changed = false;
    Object.keys(newAssignments).forEach(key => {
      if (newAssignments[key].absentTeacher === name) {
        delete newAssignments[key];
        changed = true;
      }
    });
    if (changed) setAssignments(newAssignments);
  };

  const getSuggestions = (slot: ActiveSlot) => {
    const absentTeacher = teachers.find(t => t.name === slot.absentTeacher);
    if (!absentTeacher) return [];

    const group = absentTeacher.group;

    const availableTeachers = teachers.filter(t => {
      if (t.name === slot.absentTeacher) return false;
      if (t.group !== group) return false; 
      // Rule: TTCM chỉ nhìn thấy gợi ý giáo viên thay thế trong tổ của mình
      if (role === 'ttcm' && department && t.group !== department) return false;

      const isBusy = schedules.some(s => s.giao_vien === t.name && s.thu === slot.day && s.tiet === slot.period && s.buoi === slot.session);
      return !isBusy;
    });

    const scored = availableTeachers.map(t => {
      let score = 0;
      let reasons: string[] = [];

      const normalizedSlotSubject = normalizeSubjectName(slot.subject);
      const teacherSubjects = t.teachableSubjects?.map(s => normalizeSubjectName(s)) || [];
      let canTeachSubject = teacherSubjects.includes(normalizedSlotSubject);
      
      if (!canTeachSubject && teacherSubjects.includes('KHTN')) {
        if (['Lý', 'Hóa', 'Sinh'].includes(normalizedSlotSubject)) {
          canTeachSubject = true;
        }
      }

      if (canTeachSubject) {
        score += 1000; 
        reasons.push('Dạy đúng môn');
      } else {
        reasons.push('Dạy trái môn');
      }

      const classesToday = schedules.filter(s => s.giao_vien === t.name && s.thu === slot.day).length;
      const classesThisSession = schedules.filter(s => s.giao_vien === t.name && s.thu === slot.day && s.buoi === slot.session).length;

      if (classesToday === 0) {
        score -= 500;
        reasons.push('Ngày nghỉ');
      } else if (classesThisSession === 0) {
        score -= 300;
        reasons.push('Nghỉ buổi này');
      } else {
        score += 100;
        reasons.push('Đang dạy buổi này');
      }

      const hasAdjacentBefore = schedules.some(s => s.giao_vien === t.name && s.thu === slot.day && s.tiet === slot.period - 1 && s.buoi === slot.session);
      const hasAdjacentAfter = schedules.some(s => s.giao_vien === t.name && s.thu === slot.day && s.tiet === slot.period + 1 && s.buoi === slot.session);
      
      if (hasAdjacentBefore || hasAdjacentAfter) {
        score += 50;
        reasons.push('Có tiết liền kề');
      }

      score += (10 - classesToday) * 2;
      reasons.push(`Tổng ${classesToday} tiết/ngày`);

      return { teacher: t, score, reason: reasons.join(', '), classesToday };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored;
  };

  const handleAssign = (subName: string) => {
    if (!activeSlot) return;
    const id = `${activeSlot.absentTeacher}-${activeSlot.day}-${activeSlot.session}-${activeSlot.period}`;
    setAssignments(prev => ({
      ...prev,
      [id]: {
        id,
        ...activeSlot,
        substituteTeacher: subName,
        notes: subNotes
      }
    }));
    setActiveSlot(null);
    setSelectedSub(null);
    setSubNotes('');
  };

  const handleGenerateImage = async () => {
    if (!printRef.current) return;
    setIsGenerating(true);
    
    try {
      await new Promise(resolve => setTimeout(resolve, 300));
      
      const blob = await toBlob(printRef.current, {
        backgroundColor: '#ffffff',
        pixelRatio: 2, 
        style: {
          transform: 'none', 
          margin: '0'
        }
      });

      if (blob) {
        setGeneratedBlob(blob);
      } else {
        alert('Lỗi tạo ảnh: Không thể đóng gói dữ liệu (Blob rỗng).');
      }
    } catch (error: any) {
      console.error('Lỗi khi vẽ ảnh:', error);
      alert(`Lỗi tạo ảnh: ${error.message || 'Lỗi không xác định'}. Thầy/cô thử tải lại trang nhé.`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyReadyImage = async () => {
    if (!generatedBlob) return;
    
    try {
      const item = new ClipboardItem({ 'image/png': generatedBlob });
      await navigator.clipboard.write([item]);
      
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 3000);
    } catch (error) {
      console.warn('Lỗi clipboard, tự động mở modal:', error);
      const url = URL.createObjectURL(generatedBlob);
      setPreviewImage(url);
    }
  };

  const handleDownloadReadyImage = () => {
    if (!generatedBlob) return;
    const url = URL.createObjectURL(generatedBlob);
    const link = document.createElement('a');
    link.download = `PhanCongDayThay_${exportDate.replace(/ /g, '_')}.png`;
    link.href = url;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); 
  };

  const renderMiniSchedule = (teacherName: string, activeSlot: any) => {
    const teacherSchedules = schedules.filter(s => s.giao_vien === teacherName);
    const days = [2, 3, 4, 5, 6, 7];
    const periods = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    return (
      <div className="mt-3 bg-gray-50 rounded-lg border border-gray-200 text-sm overflow-hidden">
        <div className="font-semibold p-3 bg-gray-100 text-gray-700 flex items-center border-b border-gray-200">
          <Calendar className="w-4 h-4 mr-2" /> Thời khóa biểu tuần của {teacherName}:
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-xs text-center border-collapse">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-1 py-2 font-medium text-gray-500 border-r border-gray-200 w-10">Tiết</th>
                {days.map(day => (
                  <th key={day} className="px-1 py-2 font-medium text-gray-500 border-r border-gray-200 last:border-0">
                    Thứ {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {periods.map(period => {
                const session = period <= 5 ? 'Sáng' : 'Chiều';
                const adjustedPeriod = period <= 5 ? period : period - 5;
                
                return (
                  <tr key={period} className={period === 5 ? 'border-b-2 border-gray-300' : ''}>
                    <td className="px-1 py-1.5 whitespace-nowrap font-medium text-gray-500 border-r border-gray-200 bg-gray-50">
                      {adjustedPeriod} {period === 1 ? '(S)' : period === 6 ? '(C)' : ''}
                    </td>
                    {days.map(day => {
                      const slot = teacherSchedules.find(s => s.thu === day && s.tiet === adjustedPeriod && s.buoi === session);
                      const isTargetSlot = activeSlot && activeSlot.day === day && activeSlot.session === session && activeSlot.period === adjustedPeriod;
                      
                      let cellClass = "px-1 py-1.5 border-r border-gray-200 last:border-0 relative h-8 ";
                      
                      if (isTargetSlot) {
                        cellClass += "bg-yellow-100 ring-2 ring-yellow-400 ring-inset z-10 ";
                      } else if (slot) {
                        cellClass += "bg-indigo-50 text-indigo-700 ";
                      } else {
                        cellClass += "text-gray-400 ";
                      }

                      return (
                        <td key={day} className={cellClass}>
                          {slot ? (
                            <div className="font-medium text-[11px] leading-tight" title={`${slot.lop} (${slot.mon})`}>
                              {slot.lop}
                            </div>
                          ) : isTargetSlot ? (
                            <div className="font-bold text-red-600 text-[10px] leading-tight flex flex-col items-center justify-center" title={`Dạy thay lớp ${activeSlot.className}`}>
                              <span className="bg-red-100 text-red-700 px-1 rounded border border-red-200">{activeSlot.className}</span>
                            </div>
                          ) : (
                            <span className="opacity-30">-</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderAbsentTeacherSchedule = (teacherName: string) => {
    const teacherSchedules = schedules.filter(s => s.giao_vien === teacherName);
    const days = [2, 3, 4, 5, 6, 7];
    const periods = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    return (
      <div key={teacherName} className="mb-8 bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h3 className="text-xl font-bold mb-4 text-gray-800 flex items-center">
          <Users className="w-5 h-5 mr-2 text-indigo-600" /> Lịch dạy của: {teacherName}
        </h3>
        <p className="text-sm text-gray-500 mb-4">Nhấn vào các tiết có lịch để phân công giáo viên dạy thay.</p>
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r">Tiết \ Thứ</th>
                {days.map(day => (
                  <th key={day} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r">
                    Thứ {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {periods.map(period => (
                <tr key={period} className={period === 5 ? 'border-b-4 border-gray-300' : ''}>
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 border-r bg-gray-50">
                    Tiết {period} {period <= 5 ? '(Sáng)' : '(Chiều)'}
                  </td>
                  {days.map(day => {
                    const session = period <= 5 ? 'Sáng' : 'Chiều';
                    const adjustedPeriod = period <= 5 ? period : period - 5;
                    const slot = teacherSchedules.find(s => s.thu === day && s.tiet === adjustedPeriod && s.buoi === session);
                    const slotId = `${teacherName}-${day}-${session}-${adjustedPeriod}`;
                    const assignment = assignments[slotId];
                    
                    return (
                      <td key={`${day}-${period}`} 
                          className={`px-2 py-2 border-r transition-colors ${slot ? 'bg-indigo-50/50 hover:bg-indigo-100 cursor-pointer' : 'bg-gray-50/50'}`}
                          onClick={() => {
                            if (slot) {
                              setActiveSlot({
                                absentTeacher: teacherName,
                                day,
                                session,
                                period: adjustedPeriod,
                                className: slot.lop,
                                subject: slot.mon
                              });
                              setSelectedSub(null);
                              setSubNotes(assignment?.notes || '');
                            }
                          }}>
                        {slot ? (
                          <div className="flex flex-col items-center text-center">
                            <span className="font-bold text-indigo-700">{slot.lop}</span>
                            <span className="text-xs text-gray-600">{slot.mon}</span>
                            {assignment && (
                              <span className="mt-1.5 px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded-md font-medium border border-green-200 shadow-sm">
                                Thay: {assignment.substituteTeacher}
                              </span>
                            )}
                          </div>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  if (isExporting) {
    return (
      <div className="bg-gray-50 min-h-screen py-8 print:py-0 print:bg-white">
        <div className="bg-white p-4 md:p-8 max-w-5xl mx-auto shadow-md rounded-xl border border-gray-200 print:shadow-none print:border-none print:p-0 print:max-w-none">
           <div className="flex flex-wrap justify-between items-center mb-6 gap-4 print:hidden border-b pb-4">
             <button onClick={() => setIsExporting(false)} className="text-indigo-600 hover:text-indigo-800 font-medium flex items-center bg-indigo-50 hover:bg-indigo-100 px-4 py-2 rounded-lg transition-colors">
               ← Trở lại thiết lập
             </button>
             
             {/* THANH CÔNG CỤ XUẤT ẢNH THÔNG MINH */}
             <div className="flex gap-2 flex-wrap bg-gray-50 p-2 rounded-lg border border-gray-200">
               {!generatedBlob ? (
                 <button 
                    onClick={handleGenerateImage} 
                    disabled={isGenerating}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white px-5 py-2 rounded-md flex items-center shadow-sm text-sm font-medium transition-colors"
                 >
                   {isGenerating ? (
                     <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Đang xử lý ảnh...</>
                   ) : (
                     <><ImageIcon className="w-4 h-4 mr-2" /> Tạo ảnh Báo cáo</>
                   )}
                 </button>
               ) : (
                 <>
                   <button 
                      onClick={handleCopyReadyImage} 
                      className={`text-white px-5 py-2 rounded-md flex items-center shadow-sm transition-colors text-sm font-medium ${
                        copySuccess ? 'bg-green-500 hover:bg-green-600' : 'bg-blue-600 hover:bg-blue-700'
                      }`}
                   >
                     {copySuccess ? <><Check className="w-4 h-4 mr-2" /> Đã Copy thành công</> : <><Copy className="w-4 h-4 mr-2" /> Copy Ảnh (Zalo)</>}
                   </button>
                   
                   <button 
                      onClick={handleDownloadReadyImage}
                      className="bg-indigo-100 hover:bg-indigo-200 text-indigo-700 px-4 py-2 rounded-md flex items-center shadow-sm text-sm font-medium transition-colors"
                   >
                     <Download className="w-4 h-4 mr-2" /> Tải Ảnh
                   </button>
                 </>
               )}
               
               <div className="w-px bg-gray-300 mx-1 hidden sm:block"></div>
               
               <button 
                  onClick={() => window.print()} 
                  className="bg-gray-800 hover:bg-gray-900 text-white px-4 py-2 rounded-md flex items-center shadow-sm text-sm font-medium transition-colors"
               >
                 <Printer className="w-4 h-4 mr-2" /> In tài liệu
               </button>
             </div>
           </div>
           
           <div className="relative overflow-hidden min-w-max md:min-w-full">
             {isGenerating && (
                <div className="absolute inset-0 bg-white/60 z-10 rounded-xl"></div>
             )}
             
             {/* VÙNG ĐƯỢC CHỤP ẢNH */}
             <div ref={printRef} className="bg-white p-6 print:p-0 min-w-full w-max inline-block">
               <div className="text-center mb-8">
                 <input 
                   type="text" 
                   value={exportTitle} 
                   onChange={e => setExportTitle(e.target.value)} 
                   className="text-2xl font-bold text-center w-full border-none focus:ring-0 print:p-0 uppercase bg-transparent text-gray-900" 
                 />
                 <input 
                   type="text" 
                   value={exportDate} 
                   onChange={e => setExportDate(e.target.value)} 
                   placeholder="Nhập ngày tháng năm (VD: Ngày 20 tháng 10 năm 2023)" 
                   className="text-center w-full border-none focus:ring-0 text-gray-600 mt-2 print:p-0 italic bg-transparent" 
                 />
               </div>
        
               <table className="w-full border-collapse border border-gray-800 text-sm">
                 <thead>
                   <tr className="bg-gray-100">
                     <th className="border border-gray-800 p-2">STT</th>
                     <th className="border border-gray-800 p-2 whitespace-nowrap min-w-[130px]">Giáo viên nghỉ</th>
                     <th className="border border-gray-800 p-2 whitespace-nowrap min-w-[150px]">Giáo viên dạy thay</th>
                     <th className="border border-gray-800 p-2 whitespace-nowrap px-4">Lớp</th>
                     <th className="border border-gray-800 p-2 px-4">Thứ</th>
                     <th className="border border-gray-800 p-2 px-4">Buổi</th>
                     <th className="border border-gray-800 p-2 px-4">Tiết</th>
                     <th className="border border-gray-800 p-2 whitespace-nowrap px-4">Môn</th>
                     <th className="border border-gray-800 p-2 min-w-[200px]">Ghi chú</th>
                   </tr>
                 </thead>
                 <tbody>
                   {Object.values(assignments).length === 0 ? (
                     <tr>
                       <td colSpan={9} className="border border-gray-800 p-4 text-center text-gray-500 italic">
                         Chưa có dữ liệu phân công dạy thay.
                       </td>
                     </tr>
                   ) : (
                     (Object.values(assignments) as Assignment[]).map((a, idx) => (
                       <tr key={a.id}>
                         <td className="border border-gray-800 p-2 text-center">{idx + 1}</td>
                         <td className="border border-gray-800 p-2 font-medium whitespace-nowrap">{a.absentTeacher}</td>
                         <td className="border border-gray-800 p-2 font-bold text-indigo-700 whitespace-nowrap">{a.substituteTeacher}</td>
                         <td className="border border-gray-800 p-2 text-center font-medium whitespace-nowrap">{a.className}</td>
                         <td className="border border-gray-800 p-2 text-center">{a.day}</td>
                         <td className="border border-gray-800 p-2 text-center">{a.session}</td>
                         <td className="border border-gray-800 p-2 text-center">{a.period}</td>
                         <td className="border border-gray-800 p-2 text-center whitespace-nowrap">{a.subject}</td>
                         <td className="border border-gray-800 p-2">{a.notes}</td>
                       </tr>
                     ))
                   )}
                 </tbody>
               </table>
             </div>
           </div>
        </div>

        {/* MODAL XEM TRƯỚC ẢNH KHI TRÌNH DUYỆT CHẶN COPY */}
        {previewImage && (
          <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                <h3 className="font-bold text-gray-800 text-lg">📸 Ảnh báo cáo đã sẵn sàng!</h3>
                <button 
                  onClick={() => setPreviewImage(null)} 
                  className="text-gray-500 hover:text-red-600 bg-gray-200 hover:bg-red-100 rounded-full p-1.5 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-4 bg-yellow-50 border-b border-yellow-100 text-yellow-800 text-sm text-center">
                <span className="font-bold">Trình duyệt đã chặn Copy tự động.</span> Thầy/cô vui lòng 
                <span className="font-bold text-red-600 uppercase mx-1">Nhấn chuột phải vào ảnh bên dưới</span> 
                (hoặc nhấn giữ nếu dùng điện thoại) và chọn <span className="font-bold">"Sao chép hình ảnh"</span> để dán vào Zalo nhé.
              </div>
              
              <div className="p-6 overflow-y-auto bg-gray-200 flex justify-center items-start flex-1">
                <img 
                  src={previewImage} 
                  alt="Kết quả dạy thay" 
                  className="max-w-full h-auto border border-gray-300 shadow-md rounded bg-white" 
                />
              </div>
              
              <div className="p-4 border-t border-gray-100 bg-white flex justify-center">
                <button 
                  onClick={() => {
                    const link = document.createElement('a');
                    link.download = `PhanCongDayThay_${exportDate.replace(/ /g, '_')}.png`;
                    link.href = previewImage;
                    link.click();
                  }} 
                  className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-indigo-700 flex items-center transition-colors shadow-sm"
                >
                  <Download className="w-5 h-5 mr-2" /> Hoặc Tải ảnh xuống máy
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800 flex items-center">
            <Users className="mr-2 text-indigo-600" /> Phân công Dạy thay
          </h2>
          <button
            onClick={() => setIsExporting(true)}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center shadow-sm font-medium transition-colors"
          >
            Xuất kết quả ({Object.keys(assignments).length})
          </button>
        </div>

        <div className="mb-8">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Chọn giáo viên nghỉ {role === 'ttcm' && `(Chỉ hiển thị Tổ ${department})`}
          </label>
          <select
            className="w-full max-w-md px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            onChange={handleAddAbsentTeacher}
            value=""
          >
            <option value="">-- Chọn giáo viên --</option>
            {teachers.map(t => (
              <option key={t.id || t.name} value={t.name}>{t.name} ({t.group})</option>
            ))}
          </select>
          
          {selectedAbsentTeachers.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
              {selectedAbsentTeachers.map(t => (
                <span key={t} className="bg-indigo-100 text-indigo-800 px-3 py-1.5 rounded-full flex items-center text-sm font-medium border border-indigo-200 shadow-sm">
                  {t}
                  <button 
                    onClick={() => handleRemoveAbsentTeacher(t)} 
                    className="ml-2 text-indigo-400 hover:text-indigo-900 focus:outline-none bg-white rounded-full p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedAbsentTeachers.map(renderAbsentTeacherSchedule)}

      {/* Modal for selecting substitute */}
      {activeSlot && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-5 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-gray-800">
                  Phân công dạy thay: <span className="text-indigo-600">{activeSlot.absentTeacher}</span>
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  Thứ {activeSlot.day} - Tiết {activeSlot.period} ({activeSlot.session}) - Lớp {activeSlot.className} - Môn {activeSlot.subject}
                </p>
              </div>
              <button 
                onClick={() => {
                  setActiveSlot(null);
                  setSelectedSub(null);
                }} 
                className="text-gray-400 hover:text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-full p-1.5 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
              {/* Left Pane: Teacher List */}
              <div className="w-full md:w-1/2 p-4 md:p-6 overflow-y-auto border-b md:border-b-0 md:border-r border-gray-200 bg-white">
                {assignments[`${activeSlot.absentTeacher}-${activeSlot.day}-${activeSlot.session}-${activeSlot.period}`] && (
                  <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl flex justify-between items-center shadow-sm">
                    <div>
                      <p className="font-medium text-green-800 flex items-center">
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Đã phân công: {assignments[`${activeSlot.absentTeacher}-${activeSlot.day}-${activeSlot.session}-${activeSlot.period}`].substituteTeacher}
                      </p>
                      {assignments[`${activeSlot.absentTeacher}-${activeSlot.day}-${activeSlot.session}-${activeSlot.period}`].notes && (
                        <p className="text-sm text-green-700 mt-1 ml-6">
                          Ghi chú: {assignments[`${activeSlot.absentTeacher}-${activeSlot.day}-${activeSlot.session}-${activeSlot.period}`].notes}
                        </p>
                      )}
                    </div>
                    <button 
                      onClick={() => {
                        const newAssignments = {...assignments};
                        delete newAssignments[`${activeSlot.absentTeacher}-${activeSlot.day}-${activeSlot.session}-${activeSlot.period}`];
                        setAssignments(newAssignments);
                      }} 
                      className="text-red-600 hover:text-red-800 text-sm font-medium bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Xóa phân công
                    </button>
                  </div>
                )}

                <h4 className="font-bold text-gray-700 mb-3">Gợi ý giáo viên (Cùng tổ chuyên môn)</h4>
                
                {getSuggestions(activeSlot).length === 0 ? (
                  <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-xl flex items-start">
                    <AlertCircle className="h-5 w-5 text-yellow-500 mr-2 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-yellow-700">
                      Không tìm thấy giáo viên nào rảnh vào tiết này.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {getSuggestions(activeSlot).map((s, index) => (
                      <div 
                        key={s.teacher.name} 
                        className={`border rounded-xl overflow-hidden transition-all ${selectedSub === s.teacher.name ? 'border-indigo-500 ring-1 ring-indigo-500 shadow-md' : 'border-gray-200 hover:border-indigo-300 hover:shadow-sm'}`}
                        onMouseEnter={() => setHoveredSub(s.teacher.name)}
                        onMouseLeave={() => setHoveredSub(null)}
                      >
                        <div 
                          className={`p-4 flex justify-between items-center cursor-pointer ${selectedSub === s.teacher.name ? 'bg-indigo-50/30' : 'bg-white'}`}
                          onClick={() => setSelectedSub(selectedSub === s.teacher.name ? null : s.teacher.name)}
                        >
                          <div className="flex items-center">
                            <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold mr-3 ${index === 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                              {index + 1}
                            </div>
                            <div>
                              <p className="font-bold text-gray-800">{s.teacher.name}</p>
                              <p className="text-xs text-gray-500">{s.teacher.subject} - {s.teacher.group}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md inline-block mb-1">
                              Điểm ưu tiên: {s.score}
                            </p>
                            <p className="text-xs text-gray-500">{s.reason}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Right Pane: Preview & Action */}
              <div className="w-full md:w-1/2 p-4 md:p-6 overflow-y-auto bg-gray-50 flex flex-col">
                {(hoveredSub || selectedSub) ? (
                  <div className="flex-1">
                    {renderMiniSchedule(hoveredSub || selectedSub || '', activeSlot)}
                    
                    {selectedSub && (
                      <div className="mt-6 p-5 bg-white rounded-xl border border-indigo-200 shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
                        <h5 className="font-semibold text-gray-800 mb-4">
                          Phân công cho: <span className="text-indigo-600 text-lg">{selectedSub}</span>
                        </h5>
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú (Tùy chọn)</label>
                            <input 
                              type="text" 
                              placeholder="VD: Dạy bài số 3, ôn tập chương 1..." 
                              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" 
                              value={subNotes} 
                              onChange={e => setSubNotes(e.target.value)} 
                            />
                          </div>
                          <button 
                            onClick={() => handleAssign(selectedSub)} 
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-lg font-medium shadow-sm transition-colors flex justify-center items-center"
                          >
                            <CheckCircle className="w-5 h-5 mr-2" />
                            Xác nhận Phân công
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                    <Calendar className="w-16 h-16 mb-4 text-gray-300" />
                    <p className="text-lg font-medium text-gray-500">Chưa chọn giáo viên</p>
                    <p className="text-sm mt-2 text-center max-w-xs">Di chuột vào danh sách bên trái để xem trước thời khóa biểu, hoặc click để chọn phân công.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
