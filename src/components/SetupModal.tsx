import { useState, useRef } from 'react';
import { useApp } from '@/contexts/AppContext';
import { SUPPORTED_CURRENCIES, getCurrencyPrimaryColor } from '@/lib/currencies';
import { X, Upload, Check, ChevronRight, Search, BookOpen } from 'lucide-react';
import AvatarCropper from './AvatarCropper';

interface Props {
  open: boolean;
  onComplete: () => void;
}

type CurrencyPickerTarget = 'primary' | 'secondary' | null;

export default function SetupModal({ open, onComplete }: Props) {
  const { t, language, setLanguage, setAvatar, setBookName, primaryCurrency, secondaryCurrency, setCurrencies, refreshRates, addWallet } = useApp();
  const [tempAvatar, setTempAvatar] = useState<string | null>(null);
  const [tempBookName, setTempBookName] = useState('');
  const [tempPrimaryCurrency, setTempPrimaryCurrency] = useState(primaryCurrency);
  const [tempSecondaryCurrency, setTempSecondaryCurrency] = useState(secondaryCurrency);
  const [currencyPicker, setCurrencyPicker] = useState<CurrencyPickerTarget>(null);
  const [currencySearch, setCurrencySearch] = useState('');
  const [showCropper, setShowCropper] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setSelectedImage(event.target?.result as string);
        setShowCropper(true);
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const handleCropComplete = (croppedImage: string) => {
    setTempAvatar(croppedImage);
    setShowCropper(false);
    setSelectedImage(null);
  };

  const handleCropCancel = () => {
    setShowCropper(false);
    setSelectedImage(null);
  };

  const handleRemoveAvatar = () => {
    setTempAvatar(null);
  };

  const handleComplete = () => {
    if (tempAvatar) {
      setAvatar(tempAvatar);
    }
    if (tempBookName.trim()) {
      setBookName(tempBookName.trim());
    }
    setCurrencies([tempPrimaryCurrency, tempSecondaryCurrency]);
    refreshRates();
    
    const currenciesToCreate = [tempPrimaryCurrency];
    if (tempSecondaryCurrency && tempSecondaryCurrency !== tempPrimaryCurrency) {
      currenciesToCreate.push(tempSecondaryCurrency);
    }
    
    currenciesToCreate.forEach((currencyCode, index) => {
      const currencyInfo = SUPPORTED_CURRENCIES.find(c => c.code === currencyCode);
      const defaultColor = getCurrencyPrimaryColor(currencyCode);
      
      addWallet({
        name: language === 'zh' ? `${currencyInfo?.nameZh || currencyCode}现金` : `${currencyInfo?.name || currencyCode} Cash`,
        color: defaultColor,
        icon: '💵',
        currency: currencyCode,
        balance: 0,
        type: 'cash',
        isDefault: index === 0,
        sortOrder: index,
        order: index,
      });
    });
    
    onComplete();
  };

  const CurrencyPickerModal = () => {
    if (!currencyPicker) return null;

    return (
      <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center" onClick={() => setCurrencyPicker(null)}>
        <div className="fixed inset-0 bg-foreground/30 backdrop-blur-sm modal-overlay" />
        <div
          className="relative w-full sm:max-w-sm max-h-[75vh] flex flex-col glass-card rounded-t-3xl sm:rounded-3xl modal-content overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h3 className="text-base font-semibold text-foreground">
              {currencyPicker === 'primary' ? t.account.primaryCurrency : t.account.secondaryCurrency}
            </h3>
            <button onClick={() => setCurrencyPicker(null)} className="p-1.5 rounded-xl hover:bg-secondary transition-colors">
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
          <div className="px-5 pb-3">
            <div className="flex items-center gap-2 bg-secondary/80 rounded-xl px-3 py-2.5">
              <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <input
                type="text"
                value={currencySearch}
                onChange={e => setCurrencySearch(e.target.value)}
                placeholder={t.common.search + '...'}
                className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-5 pb-5">
            <div className="rounded-2xl overflow-hidden bg-secondary/50 backdrop-blur-md">
              {SUPPORTED_CURRENCIES
                .filter(c => {
                  if (!currencySearch) return true;
                  const q = currencySearch.toLowerCase();
                  return c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || c.nameZh.includes(q) || (c.nameLocal && c.nameLocal.toLowerCase().includes(q));
                })
                .map((c, i, arr) => {
                  const currentValue = currencyPicker === 'primary' ? tempPrimaryCurrency : tempSecondaryCurrency;
                  const isSelected = c.code === currentValue;
                  const otherValue = currencyPicker === 'primary' ? tempSecondaryCurrency : tempPrimaryCurrency;
                  const isDisabled = c.code === otherValue;
                  const displayName = language === 'zh' ? c.nameZh : (c.nameLocal || c.name);
                  return (
                    <button
                      key={c.code}
                      onClick={() => {
                        if (isDisabled) return;
                        if (currencyPicker === 'primary') {
                          setTempPrimaryCurrency(c.code);
                        } else {
                          setTempSecondaryCurrency(c.code);
                        }
                        setCurrencyPicker(null);
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                        isDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-secondary/80'
                      } ${i < arr.length - 1 ? 'border-b border-border/30' : ''}`}
                    >
                      <span className="w-8 text-center text-lg">{c.symbol}</span>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-foreground">{displayName}</span>
                        <span className="text-xs text-muted-foreground ml-2">{c.code}</span>
                      </div>
                      {isSelected && <Check className="w-4.5 h-4.5 text-primary flex-shrink-0" />}
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background overflow-y-auto">
      <div className="w-full max-w-md p-6 py-8">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-foreground mb-2">{t.setup.welcome}</h1>
          <p className="text-sm text-muted-foreground">{t.setup.allInOne}</p>
        </div>

        <div className="space-y-6">
          <div className="glass-card p-5 rounded-2xl">
            <h3 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary" />
              {language === 'zh' ? '记账本名称' : 'Book Name'}
            </h3>
            <input
              type="text"
              value={tempBookName}
              onChange={e => setTempBookName(e.target.value)}
              placeholder={language === 'zh' ? '给你的记账本起个名字吧' : 'Give your book a name'}
              className="w-full bg-secondary text-foreground rounded-xl px-4 py-3 text-base outline-none placeholder:text-muted-foreground border-2 border-transparent focus:border-primary transition-colors"
              maxLength={20}
            />
            <p className="text-xs text-muted-foreground mt-2">
              {language === 'zh' ? '最多20个字符，留空则使用默认名称' : 'Max 20 characters, leave empty for default name'}
            </p>
          </div>

          <div className="glass-card p-5 rounded-2xl">
            <h3 className="text-base font-semibold text-foreground mb-3">{t.setup.avatar}</h3>
            <div className="flex flex-col items-center gap-4">
              {tempAvatar ? (
                <div className="relative group">
                  <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-primary shadow-lg">
                    <img 
                      src={tempAvatar} 
                      alt="Avatar preview" 
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <button
                    onClick={handleRemoveAvatar}
                    className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-expense text-white flex items-center justify-center text-xs font-bold shadow-md hover:bg-expense/80 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-24 h-24 rounded-full border-2 border-dashed border-muted flex flex-col items-center justify-center gap-1 hover:border-primary hover:text-primary transition-colors group"
                >
                  <Upload className="w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors" />
                  <span className="text-xs text-muted-foreground group-hover:text-primary transition-colors">{t.setup.uploadAvatar}</span>
                </button>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
              
              {tempAvatar && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-sm text-primary hover:text-primary/80 transition-colors"
                >
                  {language === 'zh' ? '更换头像' : 'Change avatar'}
                </button>
              )}
              
              <p className="text-xs text-muted-foreground">{t.setup.avatarDesc}</p>
            </div>
          </div>

          <div className="glass-card p-5 rounded-2xl">
            <h3 className="text-base font-semibold text-foreground mb-3">{t.setup.languageSelect}</h3>
            <div className="flex rounded-2xl overflow-hidden border border-border">
              <button
                onClick={() => setLanguage('zh')}
                className={`flex-1 py-3 text-sm font-medium transition-all duration-200 ${
                  language === 'zh' 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-secondary text-muted-foreground hover:bg-muted'
                }`}
              >
                中文
              </button>
              <button
                onClick={() => setLanguage('en')}
                className={`flex-1 py-3 text-sm font-medium transition-all duration-200 ${
                  language === 'en' 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-secondary text-muted-foreground hover:bg-muted'
                }`}
              >
                English
              </button>
            </div>
          </div>

          <div className="glass-card p-5 rounded-2xl">
            <h3 className="text-base font-semibold text-foreground mb-3">{t.setup.currencySelect}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t.account.primaryCurrency}</label>
                <button
                  onClick={() => { setCurrencyPicker('primary'); setCurrencySearch(''); }}
                  className="w-full flex items-center justify-between bg-secondary text-foreground rounded-xl px-3 py-2.5 text-sm hover:bg-secondary/80 transition-colors"
                >
                  <span>{SUPPORTED_CURRENCIES.find(c => c.code === tempPrimaryCurrency)?.symbol} {tempPrimaryCurrency} - {language === 'zh' ? SUPPORTED_CURRENCIES.find(c => c.code === tempPrimaryCurrency)?.nameZh : (SUPPORTED_CURRENCIES.find(c => c.code === tempPrimaryCurrency)?.nameLocal || SUPPORTED_CURRENCIES.find(c => c.code === tempPrimaryCurrency)?.name)}</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t.account.secondaryCurrency}</label>
                <button
                  onClick={() => { setCurrencyPicker('secondary'); setCurrencySearch(''); }}
                  className="w-full flex items-center justify-between bg-secondary text-foreground rounded-xl px-3 py-2.5 text-sm hover:bg-secondary/80 transition-colors"
                >
                  <span>{SUPPORTED_CURRENCIES.find(c => c.code === tempSecondaryCurrency)?.symbol} {tempSecondaryCurrency} - {language === 'zh' ? SUPPORTED_CURRENCIES.find(c => c.code === tempSecondaryCurrency)?.nameZh : (SUPPORTED_CURRENCIES.find(c => c.code === tempSecondaryCurrency)?.nameLocal || SUPPORTED_CURRENCIES.find(c => c.code === tempSecondaryCurrency)?.name)}</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={handleComplete}
          className="w-full mt-6 px-4 py-3 rounded-xl text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          {t.setup.complete}
        </button>
      </div>

      <CurrencyPickerModal />

      {showCropper && selectedImage && (
        <AvatarCropper
          image={selectedImage}
          onCrop={handleCropComplete}
          onCancel={handleCropCancel}
        />
      )}
    </div>
  );
}
