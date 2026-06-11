"use client"

import React, { useState, useEffect, useCallback, useMemo } from "react"
import { Calendar, X, ChevronDown, MapPin } from "lucide-react"
import { OptimizedSelect } from "./optimized-select"
import { BAZI_HOUR_GROUPS, normalizeBaziHourValue } from "@/lib/bazi-time-options"
import { loadGeodata, type LocationData } from "@/lib/geodata-client"

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
  initialData?: BaziData;
}

export function BaziDialog({ isOpen, onClose, onSubmit, initialData }: BaziDialogProps) {
  const [baziData, setBaziData] = useState<BaziData>(initialData ? {
    ...initialData,
    hour: normalizeBaziHourValue(initialData.hour),
  } : {
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
  const [formNotice, setFormNotice] = useState('');

  // 当 initialData 变化时更新 baziData
  useEffect(() => {
    if (initialData) {
      setBaziData({
        ...initialData,
        hour: normalizeBaziHourValue(initialData.hour),
      });
    }
  }, [initialData]);

  // 静态月份选项 - 避免重复计算
  const monthOptions = useMemo(() => {
    const months = [
      '一月', '二月', '三月', '四月', '五月', '六月',
      '七月', '八月', '九月', '十月', '十一月', '十二月'
    ];
    return months.map((month, index) => ({
      value: (index + 1).toString(),
      label: month
    }));
  }, []);

  // 加载地理位置数据 - 只加载一次
  useEffect(() => {
    if (isOpen && locationData.length === 0) {
      let cancelled = false
      loadGeodata()
        .then((data: LocationData[]) => {
          if (cancelled) return
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
      return () => {
        cancelled = true
      }
    }
  }, [isOpen, locationData.length]);

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

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
    setBaziData(prev => ({ ...prev, [name]: val }));
  }, []);

  const handleGenderChange = useCallback((isFemale: boolean) => {
    setBaziData(prev => ({ ...prev, isFemale }));
  }, []);

  const handleProvinceChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const province = e.target.value;
    // 使用 requestAnimationFrame 来延迟状态更新，提高响应性
    requestAnimationFrame(() => {
      setSelectedProvince(province);
    });
  }, []);

  const handleCityChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const city = e.target.value;
    requestAnimationFrame(() => {
      setSelectedCity(city);
    });
  }, []);

  const handleLocationModeToggle = useCallback(() => {
    setIsCustomLocation(prev => {
      if (!prev) {
        // 切换到自定义模式时，清除省市选择
        setSelectedProvince('');
        setSelectedCity('');
      }
      return !prev;
    });
  }, []);

  const handleTimeChange = useCallback((field: 'hour' | 'minute', value: string) => {
    setBaziData(prev => ({
      ...prev,
      [field]: field === 'hour' ? normalizeBaziHourValue(value) : value,
    }));
  }, []);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    setFormNotice('');
    
    // 验证必填字段
    if (!baziData.year || !baziData.month || !baziData.day || !baziData.hour) {
      setFormNotice('卜卜象还差一点点出生日期和时间，补齐后我就能稳稳排盘啦。');
      return;
    }
    
    onSubmit(baziData);
  }, [baziData, onSubmit]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 背景遮罩 */}
      <div 
        className="fixed inset-0 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* 弹窗内容 */}
      <div className="relative bg-card/95 backdrop-blur-sm border border-border rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-xl glass-minimal">
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 w-8 h-8 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center transition-colors"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>

        {/* 标题 */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
            <Calendar className="w-4 h-4 text-primary-foreground" />
          </div>
          <h2 className="text-xl font-light text-foreground">给小象补八字资料</h2>
        </div>

        {/* 表单 */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {formNotice && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm font-light text-foreground">
              {formNotice}
            </div>
          )}

          {/* 日期选择 */}
          <div className="space-y-3">
            <label className="block text-sm font-light text-foreground">
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
                  className="w-full px-3 py-2 pr-8 rounded-lg bg-card/60 border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60 focus:bg-card/80 transition-all duration-300"
                  placeholder="1995"
                  required
                />
                <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground text-sm font-light pointer-events-none">
                  年
                </span>
              </div>
              
              {/* 月份下拉选择 */}
              <div className="relative">
                <select
                  name="month"
                  value={baziData.month}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 rounded-lg bg-card/60 border border-border text-foreground focus:outline-none focus:border-primary/60 focus:bg-card/80 transition-all duration-300 appearance-none cursor-pointer"
                  required
                >
                  {monthOptions.map(month => (
                    <option key={month.value} value={month.value}>
                      {month.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              </div>
              
              {/* 日期输入 */}
              <div className="relative">
                <input
                  type="text"
                  name="day"
                  value={baziData.day}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 pr-8 rounded-lg bg-card/60 border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60 focus:bg-card/80 transition-all duration-300"
                  placeholder="1"
                  required
                />
                <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground text-sm font-light pointer-events-none">
                  日
                </span>
              </div>
            </div>
          </div>

          {/* 时间选择 */}
          <div className="space-y-3">
            <label className="block text-sm font-light text-foreground">
              出生时间
            </label>
            <div className="grid grid-cols-2 gap-4">
              <div className="relative">
                <select
                  value={normalizeBaziHourValue(baziData.hour)}
                  onChange={(e) => handleTimeChange('hour', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-card/60 border border-border text-foreground focus:outline-none focus:border-primary/60 focus:bg-card/80 transition-all duration-300 appearance-none cursor-pointer"
                  required
                >
                  <option value="">时</option>
                  {BAZI_HOUR_GROUPS.map(group => (
                    <optgroup key={group.label} label={`${group.label} ${group.rangeLabel}`}>
                      {group.hours.map(hour => (
                        <option key={hour.value} value={hour.value}>
                          {hour.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              </div>
              <div className="relative">
                <input
                  type="text"
                  value={baziData.minute}
                  onChange={(e) => handleTimeChange('minute', e.target.value)}
                  className="w-full px-3 py-2 pr-8 rounded-lg bg-card/60 border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60 focus:bg-card/80 transition-all duration-300"
                  placeholder="00"
                  required
                />
                <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground text-sm font-light pointer-events-none">
                  分
                </span>
              </div>
            </div>
          </div>
          
          {/* 地理位置设置 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-light text-foreground">
                出生地点
              </label>
              <button
                type="button"
                onClick={handleLocationModeToggle}
                className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-light transition-all duration-300 ${
                  isCustomLocation 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                <MapPin className="w-3 h-3" />
                自己填经纬度
              </button>
            </div>

            {!isCustomLocation ? (
              // 省市选择模式
              <div className="grid grid-cols-2 gap-4">
                <OptimizedSelect
                  value={selectedProvince}
                  onChange={handleProvinceChange}
                  options={provinces}
                  placeholder="请选择省份"
                />
                <OptimizedSelect
                  value={selectedCity}
                  onChange={handleCityChange}
                  options={cities}
                  placeholder="请选择城市"
                  disabled={!selectedProvince}
                />
              </div>
            ) : (
              // 自定义经纬度模式
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-light text-muted-foreground mb-1">
                    经度
                  </label>
                  <input
                    type="number"
                    name="longitude"
                    value={baziData.longitude}
                    onChange={handleInputChange}
                    step="0.000001"
                    className="w-full px-3 py-2 rounded-lg bg-card/60 border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60 focus:bg-card/80 transition-all duration-300"
                    placeholder="121.5"
                  />
                </div>
                <div>
                  <label className="block text-xs font-light text-muted-foreground mb-1">
                    纬度
                  </label>
                  <input
                    type="number"
                    name="latitude"
                    value={baziData.latitude}
                    onChange={handleInputChange}
                    step="0.000001"
                    className="w-full px-3 py-2 rounded-lg bg-card/60 border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60 focus:bg-card/80 transition-all duration-300"
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
                className="rounded text-foreground focus:ring-primary"
              />
              <span className="text-sm font-light text-foreground">阳历</span>
            </label>
            
            <div className="flex items-center space-x-1">
              <span className="text-sm font-light text-foreground mr-3">性别:</span>
              <button
                type="button"
                onClick={() => handleGenderChange(false)}
                className={`px-3 py-1 rounded-full text-xs font-light transition-all duration-300 ${
                  !baziData.isFemale 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                男性
              </button>
              <button
                type="button"
                onClick={() => handleGenderChange(true)}
                className={`px-3 py-1 rounded-full text-xs font-light transition-all duration-300 ${
                  baziData.isFemale 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
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
              className="px-4 py-2 rounded-full bg-accent/20 text-accent text-sm font-light hover:bg-accent/30 transition-all duration-300"
            >
              小象示例
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-full bg-muted text-muted-foreground text-sm font-light hover:bg-muted/80 transition-all duration-300"
            >
              先不填
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-light hover:opacity-90 transition-all duration-300"
            >
              交给小象
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
