"use client"

import React, { useState, useEffect } from "react"
import { Calendar, X, ChevronDown } from "lucide-react"

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

interface LocationData {
  area: string;
  city: string;
  country: string;
  lat: string;
  lng: string;
  province: string;
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

  const [locationData, setLocationData] = useState<LocationData[]>([]);
  const [provinces, setProvinces] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [selectedProvince, setSelectedProvince] = useState<string>('');
  const [selectedCity, setSelectedCity] = useState<string>('');

  // 加载地理位置数据
  useEffect(() => {
    if (isOpen) {
      fetch('/geodata/data.json')
        .then(response => response.json())
        .then((data: LocationData[]) => {
          setLocationData(data);
          
          // 提取省份列表（去重）
          const uniqueProvinces = Array.from(
            new Set(data.map(item => item.province).filter(Boolean))
          );
          setProvinces(uniqueProvinces);
        })
        .catch(error => {
          console.error('加载地理位置数据失败:', error);
        });
    }
  }, [isOpen]);

  // 当选择省份时，更新城市列表
  useEffect(() => {
    if (selectedProvince && locationData.length > 0) {
      const provinceCities = Array.from(
        new Set(
          locationData
            .filter(item => item.province === selectedProvince)
            .map(item => item.city)
            .filter(Boolean)
        )
      );
      setCities(provinceCities);
      setSelectedCity(''); // 重置城市选择
    }
  }, [selectedProvince, locationData]);

  // 当选择城市时，更新经纬度
  useEffect(() => {
    if (selectedProvince && selectedCity && locationData.length > 0) {
      const location = locationData.find(
        item => item.province === selectedProvince && item.city === selectedCity
      );
      if (location) {
        setBaziData(prev => ({
          ...prev,
          longitude: location.lng,
          latitude: location.lat
        }));
      }
    }
  }, [selectedProvince, selectedCity, locationData]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
    setBaziData(prev => ({ ...prev, [name]: val }));
  };

  const handleGenderChange = (isFemale: boolean) => {
    setBaziData(prev => ({ ...prev, isFemale }));
  };

  const handleProvinceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const province = e.target.value;
    setSelectedProvince(province);
  };

  const handleCityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const city = e.target.value;
    setSelectedCity(city);
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
                时间（小时取整数即可）
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
          
          {/* 地理位置选择 */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div className="relative">
                <label className="block text-sm font-light text-neutral-700 mb-1">
                  省份
                </label>
                <div className="relative">
                  <select
                    value={selectedProvince}
                    onChange={handleProvinceChange}
                    className="w-full px-3 py-2 rounded-lg bg-white/60 border border-neutral-200/40 text-neutral-800 focus:outline-none focus:border-neutral-300/60 focus:bg-white/80 transition-all duration-300 appearance-none cursor-pointer"
                  >
                    <option value="">请选择省份</option>
                    {provinces.map(province => (
                      <option key={province} value={province}>
                        {province}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-neutral-500 pointer-events-none" />
                </div>
              </div>
              <div className="relative">
                <label className="block text-sm font-light text-neutral-700 mb-1">
                  城市
                </label>
                <div className="relative">
                  <select
                    value={selectedCity}
                    onChange={handleCityChange}
                    disabled={!selectedProvince}
                    className="w-full px-3 py-2 rounded-lg bg-white/60 border border-neutral-200/40 text-neutral-800 focus:outline-none focus:border-neutral-300/60 focus:bg-white/80 transition-all duration-300 appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="">请选择城市</option>
                    {cities.map(city => (
                      <option key={city} value={city}>
                        {city}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-neutral-500 pointer-events-none" />
                </div>
              </div>
            </div>
            
            {/* 显示当前经纬度 */}
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
                  className="w-full px-3 py-2 rounded-lg bg-neutral-50 border border-neutral-200/40 text-neutral-600 text-sm font-light focus:outline-none"
                  readOnly
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
                  className="w-full px-3 py-2 rounded-lg bg-neutral-50 border border-neutral-200/40 text-neutral-600 text-sm font-light focus:outline-none"
                  readOnly
                />
              </div>
            </div>
          </div>
          
          <div className="flex items-center justify-between py-2">
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
            
            <div className="flex items-center space-x-1">
              <span className="text-sm font-light text-neutral-700 mr-3">性别:</span>
              <button
                type="button"
                onClick={() => handleGenderChange(false)}
                className={`px-3 py-1 rounded-full text-xs font-light transition-all duration-300 ${
                  !baziData.isFemale 
                    ? 'bg-neutral-800 text-white' 
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                男性
              </button>
              <button
                type="button"
                onClick={() => handleGenderChange(true)}
                className={`px-3 py-1 rounded-full text-xs font-light transition-all duration-300 ${
                  baziData.isFemale 
                    ? 'bg-neutral-800 text-white' 
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                女性
              </button>
            </div>
          </div>
          
          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={() => {
                setBaziData({
                  year: '2000',
                  month: '1',
                  day: '1',
                  hour: '15',
                  isSolar: true,
                  isFemale: false,
                  longitude: '121.48053886017651',
                  latitude: '31.235929042252014'
                });
                setSelectedProvince('上海市');
                setSelectedCity('市辖区');
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
