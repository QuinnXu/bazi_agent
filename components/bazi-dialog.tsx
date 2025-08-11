"use client"

import React, { useState } from "react"
import { Calendar, X } from "lucide-react"

interface BaziData {
  year: string;
  month: string;
  day: string;
  hour: string;
  isSolar: boolean;
  isFemale: boolean;
  longitude: string;
  latitude: string;
}

interface BaziDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: BaziData) => void;
}

export function BaziDialog({ isOpen, onClose, onSubmit }: BaziDialogProps) {
  const [baziData, setBaziData] = useState<BaziData>({
    year: '',
    month: '',
    day: '',
    hour: '',
    isSolar: true,
    isFemale: false,
    longitude: '121.5',
    latitude: '31.2'
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
    setBaziData(prev => ({ ...prev, [name]: val }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // 验证必填字段
    if (!baziData.year || !baziData.month || !baziData.day || !baziData.hour) {
      alert('请填写完整的出生日期和时间信息');
      return;
    }
    
    onSubmit(baziData);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 背景遮罩 */}
      <div 
        className="fixed inset-0 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* 弹窗内容 */}
      <div className="relative bg-white/90 backdrop-blur-sm border border-neutral-200/40 rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-xl">
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 w-8 h-8 rounded-full bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center transition-colors"
        >
          <X className="w-4 h-4 text-neutral-600" />
        </button>

        {/* 标题 */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center">
            <Calendar className="w-4 h-4 text-white" />
          </div>
          <h2 className="text-xl font-light text-neutral-800">八字排盘</h2>
        </div>

        {/* 表单 */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-light text-neutral-700 mb-1">
                年份
              </label>
              <input
                type="number"
                name="year"
                value={baziData.year}
                onChange={handleInputChange}
                className="w-full px-3 py-2 rounded-lg bg-white/60 border border-neutral-200/40 text-neutral-800 placeholder-neutral-500 focus:outline-none focus:border-neutral-300/60 focus:bg-white/80 transition-all duration-300"
                placeholder="1990"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-light text-neutral-700 mb-1">
                月份
              </label>
              <input
                type="number"
                name="month"
                value={baziData.month}
                onChange={handleInputChange}
                className="w-full px-3 py-2 rounded-lg bg-white/60 border border-neutral-200/40 text-neutral-800 placeholder-neutral-500 focus:outline-none focus:border-neutral-300/60 focus:bg-white/80 transition-all duration-300"
                placeholder="1-12"
                min="1"
                max="12"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-light text-neutral-700 mb-1">
                日期
              </label>
              <input
                type="number"
                name="day"
                value={baziData.day}
                onChange={handleInputChange}
                className="w-full px-3 py-2 rounded-lg bg-white/60 border border-neutral-200/40 text-neutral-800 placeholder-neutral-500 focus:outline-none focus:border-neutral-300/60 focus:bg-white/80 transition-all duration-300"
                placeholder="1-31"
                min="1"
                max="31"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-light text-neutral-700 mb-1">
                时辰
              </label>
              <input
                type="number"
                name="hour"
                value={baziData.hour}
                onChange={handleInputChange}
                className="w-full px-3 py-2 rounded-lg bg-white/60 border border-neutral-200/40 text-neutral-800 placeholder-neutral-500 focus:outline-none focus:border-neutral-300/60 focus:bg-white/80 transition-all duration-300"
                placeholder="0-23"
                min="0"
                max="23"
                required
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-light text-neutral-700 mb-1">
                经度
              </label>
              <input
                type="text"
                name="longitude"
                value={baziData.longitude}
                onChange={handleInputChange}
                className="w-full px-3 py-2 rounded-lg bg-white/60 border border-neutral-200/40 text-neutral-800 placeholder-neutral-500 focus:outline-none focus:border-neutral-300/60 focus:bg-white/80 transition-all duration-300"
                placeholder="121.5"
              />
            </div>
            <div>
              <label className="block text-sm font-light text-neutral-700 mb-1">
                纬度
              </label>
              <input
                type="text"
                name="latitude"
                value={baziData.latitude}
                onChange={handleInputChange}
                className="w-full px-3 py-2 rounded-lg bg-white/60 border border-neutral-200/40 text-neutral-800 placeholder-neutral-500 focus:outline-none focus:border-neutral-300/60 focus:bg-white/80 transition-all duration-300"
                placeholder="31.2"
              />
            </div>
          </div>
          
          <div className="flex items-center space-x-6 py-2">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                name="isSolar"
                checked={baziData.isSolar}
                onChange={handleInputChange}
                className="rounded text-neutral-800 focus:ring-neutral-500"
              />
              <span className="text-sm font-light text-neutral-700">阳历</span>
            </label>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                name="isFemale"
                checked={baziData.isFemale}
                onChange={handleInputChange}
                className="rounded text-neutral-800 focus:ring-neutral-500"
              />
              <span className="text-sm font-light text-neutral-700">女性</span>
            </label>
          </div>
            <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={() => {
                setBaziData({
                  year: '1994',
                  month: '9',
                  day: '23',
                  hour: '8',
                  isSolar: true,
                  isFemale: false,
                  longitude: '121.5',
                  latitude: '31.2'
                });
              }}
              className="px-4 py-2 rounded-full bg-blue-100 text-blue-700 text-sm font-light hover:bg-blue-200 transition-all duration-300"
            >
              示例
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-full bg-neutral-100 text-neutral-700 text-sm font-light hover:bg-neutral-200 transition-all duration-300"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-full bg-neutral-800 text-white text-sm font-light hover:bg-neutral-700 transition-all duration-300"
            >
              确认
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
