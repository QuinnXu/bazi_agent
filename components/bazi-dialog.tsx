"use client"

import React, { useState, useEffect } from "react"
import { Calendar, X, ChevronDown, MapPin, Clock } from "lucide-react"

interface BaziData {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
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
    year: '1995',
    month: '1',
    day: '1',
    hour: '',
    minute: '',
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
  const [isCustomLocation, setIsCustomLocation] = useState(false);

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
    if (selectedProvince && selectedCity && locationData.length > 0 && !isCustomLocation) {
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
  }, [selectedProvince, selectedCity, locationData, isCustomLocation]);

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

  const handleLocationModeToggle = () => {
    setIsCustomLocation(!isCustomLocation);
    if (!isCustomLocation) {
      // 切换到自定义模式时，清除省市选择
      setSelectedProvince('');
      setSelectedCity('');
    }
  };

  const handleTimeChange = (field: 'hour' | 'minute', value: string) => {
    setBaziData(prev => ({ ...prev, [field]: value }));
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

  const generateTimeOptions = (max: number) => {
    return Array.from({ length: max }, (_, i) => 
      i.toString().padStart(2, '0')
    );
  };

  // 生成月份选项
  const generateMonthOptions = () => {
    const months = [
      '一月', '二月', '三月', '四月', '五月', '六月',
      '七月', '八月', '九月', '十月', '十一月', '十二月'
    ];
    return months.map((month, index) => ({
      value: (index + 1).toString(),
      label: month
    }));
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
          {/* 日期选择 */}
          <div className="space-y-3">
            <label className="block text-sm font-light text-neutral-700">
              出生日期
            </label>
            <div className="grid grid-cols-3 gap-4">
              {/* 年份输入 */}
              <div className="relative">
                <input
                  type="text"
                  name="year"
                  value={baziData.year}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 pr-8 rounded-lg bg-white/60 border border-neutral-200/40 text-neutral-800 placeholder-neutral-500 focus:outline-none focus:border-neutral-300/60 focus:bg-white/80 transition-all duration-300"
                  placeholder="1995"
                  required
                />
                <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-neutral-500 text-sm font-light pointer-events-none">
                  年
                </span>
              </div>
              
              {/* 月份下拉选择 */}
              <div className="relative">
                <select
                  name="month"
                  value={baziData.month}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 rounded-lg bg-white/60 border border-neutral-200/40 text-neutral-800 focus:outline-none focus:border-neutral-300/60 focus:bg-white/80 transition-all duration-300 appearance-none cursor-pointer"
                  required
                >
                  {generateMonthOptions().map(month => (
                    <option key={month.value} value={month.value}>
                      {month.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-neutral-500 pointer-events-none" />
              </div>
              
              {/* 日期输入 */}
              <div className="relative">
                <input
                  type="text"
                  name="day"
                  value={baziData.day}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 pr-8 rounded-lg bg-white/60 border border-neutral-200/40 text-neutral-800 placeholder-neutral-500 focus:outline-none focus:border-neutral-300/60 focus:bg-white/80 transition-all duration-300"
                  placeholder="1"
                  required
                />
                <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-neutral-500 text-sm font-light pointer-events-none">
                  日
                </span>
              </div>
            </div>
          </div>

          {/* 时间选择 */}
          <div className="space-y-3">
            <label className="block text-sm font-light text-neutral-700">
              出生时间
            </label>
            <div className="grid grid-cols-2 gap-4">
              <div className="relative">
                <select
                  value={baziData.hour}
                  onChange={(e) => handleTimeChange('hour', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white/60 border border-neutral-200/40 text-neutral-800 focus:outline-none focus:border-neutral-300/60 focus:bg-white/80 transition-all duration-300 appearance-none cursor-pointer"
                  required
                >
                  <option value="">时</option>
                  {generateTimeOptions(24).map(hour => (
                    <option key={hour} value={hour}>
                      {hour}时
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-neutral-500 pointer-events-none" />
              </div>
              <div className="relative">
                <input
                  type="text"
                  value={baziData.minute}
                  onChange={(e) => handleTimeChange('minute', e.target.value)}
                  className="w-full px-3 py-2 pr-8 rounded-lg bg-white/60 border border-neutral-200/40 text-neutral-800 placeholder-neutral-500 focus:outline-none focus:border-neutral-300/60 focus:bg-white/80 transition-all duration-300"
                  placeholder="00"
                  required
                />
                <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-neutral-500 text-sm font-light pointer-events-none">
                  分
                </span>
              </div>
            </div>
          </div>
          
          {/* 地理位置设置 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-light text-neutral-700">
                出生地点
              </label>
              <button
                type="button"
                onClick={handleLocationModeToggle}
                className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-light transition-all duration-300 ${
                  isCustomLocation 
                    ? 'bg-neutral-800 text-white' 
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                <MapPin className="w-3 h-3" />
                自定义经纬度
              </button>
            </div>

            {!isCustomLocation ? (
              // 省市选择模式
              <div className="grid grid-cols-2 gap-4">
                <div className="relative">
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
            ) : (
              // 自定义经纬度模式
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-light text-neutral-600 mb-1">
                    经度
                  </label>
                  <input
                    type="number"
                    name="longitude"
                    value={baziData.longitude}
                    onChange={handleInputChange}
                    step="0.000001"
                    className="w-full px-3 py-2 rounded-lg bg-white/60 border border-neutral-200/40 text-neutral-800 placeholder-neutral-500 focus:outline-none focus:border-neutral-300/60 focus:bg-white/80 transition-all duration-300"
                    placeholder="121.5"
                  />
                </div>
                <div>
                  <label className="block text-xs font-light text-neutral-600 mb-1">
                    纬度
                  </label>
                  <input
                    type="number"
                    name="latitude"
                    value={baziData.latitude}
                    onChange={handleInputChange}
                    step="0.000001"
                    className="w-full px-3 py-2 rounded-lg bg-white/60 border border-neutral-200/40 text-neutral-800 placeholder-neutral-500 focus:outline-none focus:border-neutral-300/60 focus:bg-white/80 transition-all duration-300"
                    placeholder="31.2"
                  />
                </div>
              </div>
            )}
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
                  minute: '30',
                  isSolar: true,
                  isFemale: false,
                  longitude: '121.48053886017651',
                  latitude: '31.235929042252014'
                });
                setSelectedProvince('上海市');
                setSelectedCity('市辖区');
                setIsCustomLocation(false);
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
