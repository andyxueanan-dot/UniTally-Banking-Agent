import { useState, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { getCurrencySymbol } from '@/lib/currencies';
import { Download, Upload, Calendar, ChevronDown, X, Check, FileText } from 'lucide-react';
import DatePicker from '@/components/DatePicker';
import OptionPicker from '@/components/OptionPicker';
import { translations } from '@/lib/i18n';

function getDateFromDatetime(datetime: string): string {
  return datetime.split('T')[0];
}

export default function DataExportImport() {
  const { transactions, wallets, platforms, categories, primaryCurrency, language, addTransaction, t } = useApp();
  const tr = translations[language];

  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterWallet, setFilterWallet] = useState('all');
  const [filterPlatform, setFilterPlatform] = useState('all');
  const [filterType, setFilterType] = useState('all');

  const [showDateFilterModal, setShowDateFilterModal] = useState(false);
  const [tempStartDate, setTempStartDate] = useState('');
  const [tempEndDate, setTempEndDate] = useState('');
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showWalletPicker, setShowWalletPicker] = useState(false);
  const [showPlatformPicker, setShowPlatformPicker] = useState(false);
  const [showTypePicker, setShowTypePicker] = useState(false);

  const [importStatus, setImportStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [importMessage, setImportMessage] = useState('');
  const [importCount, setImportCount] = useState(0);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      const txDate = getDateFromDatetime(tx.datetime);
      if (filterStartDate && txDate < filterStartDate) return false;
      if (filterEndDate && txDate > filterEndDate) return false;
      if (filterWallet !== 'all' && tx.walletId !== filterWallet) return false;
      if (filterPlatform !== 'all' && tx.platformId !== filterPlatform) return false;
      if (filterType !== 'all' && tx.type !== filterType) return false;
      return true;
    });
  }, [transactions, filterStartDate, filterEndDate, filterWallet, filterPlatform, filterType]);

  const typeOptions = [
    { id: 'all', name: language === 'zh' ? '全部类型' : 'All Types' },
    { id: 'expense', name: language === 'zh' ? '消费' : 'Expense' },
    { id: 'income', name: language === 'zh' ? '入账' : 'Income' },
    { id: 'transfer', name: language === 'zh' ? '转账' : 'Transfer' },
  ];

  const exportToCSV = () => {
    const headers = [
      'datetime',
      'type',
      'amount',
      'currency',
      'category',
      'walletId',
      'walletName',
      'platformId',
      'platformName',
      'note',
      'location',
      'latitude',
      'longitude'
    ];

    const rows = filteredTransactions.map(tx => {
      const wallet = wallets.find(w => w.id === tx.walletId);
      const platform = platforms.find(p => p.id === tx.platformId);
      const category = categories.find(c => c.id === tx.category);
      
      return [
        tx.datetime,
        tx.type,
        tx.amount,
        tx.currency,
        category?.name || tx.category,
        tx.walletId,
        wallet?.name || '',
        tx.platformId || '',
        platform?.name || '',
        tx.note || '',
        tx.location || '',
        tx.latitude || '',
        tx.longitude || ''
      ].map(field => {
        const str = String(field);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      }).join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const dateRange = filterStartDate || filterEndDate 
      ? `_${filterStartDate || 'start'}_to_${filterEndDate || 'end'}`
      : '';
    link.download = `transactions${dateRange}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split('\n').filter(line => line.trim());
        
        if (lines.length < 2) {
          setImportStatus('error');
          setImportMessage(language === 'zh' ? '文件为空或格式错误' : 'File is empty or format error');
          return;
        }

        const headerLine = lines[0];
        const headers = headerLine.split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        
        const datetimeIdx = headers.indexOf('datetime');
        const typeIdx = headers.indexOf('type');
        const amountIdx = headers.indexOf('amount');
        const currencyIdx = headers.indexOf('currency');
        const categoryIdx = headers.indexOf('category');
        const walletIdIdx = headers.indexOf('walletId');
        const platformIdIdx = headers.indexOf('platformId');
        const noteIdx = headers.indexOf('note');
        const locationIdx = headers.indexOf('location');
        const latitudeIdx = headers.indexOf('latitude');
        const longitudeIdx = headers.indexOf('longitude');

        if (datetimeIdx === -1 || typeIdx === -1 || amountIdx === -1) {
          setImportStatus('error');
          setImportMessage(language === 'zh' ? '缺少必要字段' : 'Missing required fields');
          return;
        }

        let importedCount = 0;
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          const values: string[] = [];
          let current = '';
          let inQuotes = false;
          
          for (let j = 0; j < line.length; j++) {
            const char = line[j];
            if (char === '"') {
              if (inQuotes && line[j + 1] === '"') {
                current += '"';
                j++;
              } else {
                inQuotes = !inQuotes;
              }
            } else if (char === ',' && !inQuotes) {
              values.push(current);
              current = '';
            } else {
              current += char;
            }
          }
          values.push(current);

          const type = values[typeIdx] as 'expense' | 'income' | 'transfer';
          if (!['expense', 'income', 'transfer'].includes(type)) continue;

          let categoryId = values[categoryIdx] || 'other';
          const categoryObj = categories.find(c => c.id === categoryId || c.name === categoryId);
          if (categoryObj) categoryId = categoryObj.id;

          let walletId = values[walletIdIdx] || wallets[0]?.id || '';
          if (!wallets.find(w => w.id === walletId)) {
            walletId = wallets[0]?.id || '';
          }

          let platformId = values[platformIdIdx] || '';
          if (platformId && !platforms.find(p => p.id === platformId)) {
            platformId = '';
          }

          addTransaction({
            datetime: values[datetimeIdx] || new Date().toISOString(),
            type,
            amount: parseFloat(values[amountIdx]) || 0,
            currency: values[currencyIdx] || primaryCurrency,
            category: categoryId,
            walletId,
            platformId,
            note: values[noteIdx] || '',
            location: values[locationIdx] || '',
            latitude: values[latitudeIdx] ? parseFloat(values[latitudeIdx]) : undefined,
            longitude: values[longitudeIdx] ? parseFloat(values[longitudeIdx]) : undefined,
          });
          importedCount++;
        }

        setImportCount(importedCount);
        setImportStatus('success');
        setImportMessage(language === 'zh' 
          ? `成功导入 ${importedCount} 条记录` 
          : `Successfully imported ${importedCount} records`);
      } catch (error) {
        setImportStatus('error');
        setImportMessage(language === 'zh' ? '导入失败，请检查文件格式' : 'Import failed, please check file format');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  return (
    <div className="space-y-6">
      <div className="glass-card">
        <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Download className="w-5 h-5" />
          {language === 'zh' ? '数据导出' : 'Export Data'}
        </h3>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <button
            onClick={() => {
              setTempStartDate(filterStartDate);
              setTempEndDate(filterEndDate);
              setShowDateFilterModal(true);
            }}
            className="bg-secondary text-foreground rounded-xl px-3 py-2.5 text-sm outline-none flex items-center justify-between"
          >
            <span className="truncate text-xs">
              {filterStartDate || filterEndDate
                ? `${filterStartDate || '...'} ~ ${filterEndDate || '...'}`
                : (language === 'zh' ? '全部时间' : 'All Time')}
            </span>
            <Calendar className="w-4 h-4 text-muted-foreground" />
          </button>
          <button
            onClick={() => setShowTypePicker(true)}
            className="bg-secondary text-foreground rounded-xl px-3 py-2.5 text-sm outline-none flex items-center justify-between"
          >
            <span className="truncate text-xs">
              {typeOptions.find(t => t.id === filterType)?.name}
            </span>
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </button>
          <button
            onClick={() => setShowWalletPicker(true)}
            className="bg-secondary text-foreground rounded-xl px-3 py-2.5 text-sm outline-none flex items-center justify-between"
          >
            <span className="truncate text-xs">
              {filterWallet === 'all' ? (language === 'zh' ? '全部账户' : 'All Wallets') : wallets.find(w => w.id === filterWallet)?.name}
            </span>
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </button>
          <button
            onClick={() => setShowPlatformPicker(true)}
            className="bg-secondary text-foreground rounded-xl px-3 py-2.5 text-sm outline-none flex items-center justify-between"
          >
            <span className="truncate text-xs">
              {filterPlatform === 'all' ? (language === 'zh' ? '全部平台' : 'All Platforms') : (tr.platforms[filterPlatform as keyof typeof tr.platforms] || platforms.find(p => p.id === filterPlatform)?.name)}
            </span>
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="text-sm text-muted-foreground mb-4">
          {language === 'zh' 
            ? `已选择 ${filteredTransactions.length} 条记录` 
            : `${filteredTransactions.length} records selected`}
        </div>

        <button
          onClick={exportToCSV}
          disabled={filteredTransactions.length === 0}
          className="w-full py-3 rounded-2xl font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed gradient-primary text-primary-foreground flex items-center justify-center gap-2"
        >
          <Download className="w-5 h-5" />
          {language === 'zh' ? '导出为CSV文件' : 'Export as CSV File'}
        </button>
      </div>

      <div className="glass-card">
        <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Upload className="w-5 h-5" />
          {language === 'zh' ? '数据导入' : 'Import Data'}
        </h3>

        <div className="mb-4 p-4 bg-secondary/50 rounded-xl">
          <div className="flex items-start gap-3">
            <FileText className="w-5 h-5 text-muted-foreground mt-0.5" />
            <div className="text-sm text-muted-foreground">
              <p className="mb-2">{language === 'zh' ? '支持导入CSV格式文件，文件需包含以下字段：' : 'Supports CSV format files with the following fields:'}</p>
              <p className="text-xs font-mono bg-secondary rounded-lg p-2 overflow-x-auto">
                datetime, type, amount, currency, category, walletId, platformId, note
              </p>
            </div>
          </div>
        </div>

        {importStatus !== 'idle' && (
          <div className={`mb-4 p-4 rounded-xl ${
            importStatus === 'success' ? 'bg-income/10 text-income' : 'bg-expense/10 text-expense'
          }`}>
            {importMessage}
          </div>
        )}

        <label className="block">
          <div className="w-full py-3 rounded-2xl font-semibold transition-all duration-200 border-2 border-dashed border-muted text-muted-foreground hover:border-primary hover:text-primary cursor-pointer flex items-center justify-center gap-2">
            <Upload className="w-5 h-5" />
            {language === 'zh' ? '选择CSV文件导入' : 'Select CSV File to Import'}
          </div>
          <input
            type="file"
            accept=".csv"
            onChange={handleFileImport}
            className="hidden"
          />
        </label>
      </div>

      {showDateFilterModal && (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center" onClick={() => setShowDateFilterModal(false)}>
          <div className="fixed inset-0 bg-foreground/30 backdrop-blur-sm modal-overlay" />
          <div
            className="relative w-full sm:max-w-md glass-card rounded-t-3xl sm:rounded-3xl modal-content overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/30">
              <button
                onClick={() => setShowDateFilterModal(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {language === 'zh' ? '取消' : 'Cancel'}
              </button>
              <h3 className="text-base font-semibold text-foreground">
                {language === 'zh' ? '选择时间范围' : 'Select Date Range'}
              </h3>
              <button
                onClick={() => {
                  setFilterStartDate(tempStartDate);
                  setFilterEndDate(tempEndDate);
                  setShowDateFilterModal(false);
                }}
                className="text-primary hover:text-primary/80 transition-colors font-medium"
              >
                {language === 'zh' ? '确定' : 'OK'}
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">
                  {language === 'zh' ? '起始日期' : 'Start Date'}
                </label>
                <button
                  onClick={() => setShowStartDatePicker(true)}
                  className="w-full bg-secondary text-foreground rounded-xl px-4 py-3 text-sm outline-none flex items-center justify-between"
                >
                  <span>{tempStartDate || (language === 'zh' ? '选择起始日期' : 'Select start date')}</span>
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>

              <div>
                <label className="text-sm text-muted-foreground mb-2 block">
                  {language === 'zh' ? '终止日期' : 'End Date'}
                </label>
                <button
                  onClick={() => setShowEndDatePicker(true)}
                  className="w-full bg-secondary text-foreground rounded-xl px-4 py-3 text-sm outline-none flex items-center justify-between"
                >
                  <span>{tempEndDate || (language === 'zh' ? '选择终止日期' : 'Select end date')}</span>
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => {
                    setTempStartDate('');
                    setTempEndDate('');
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-secondary text-muted-foreground text-sm"
                >
                  {language === 'zh' ? '清除' : 'Clear'}
                </button>
                <button
                  onClick={() => {
                    const today = new Date();
                    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
                    setTempStartDate(startOfMonth.toISOString().split('T')[0]);
                    setTempEndDate(today.toISOString().split('T')[0]);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-secondary text-foreground text-sm"
                >
                  {language === 'zh' ? '本月' : 'This Month'}
                </button>
                <button
                  onClick={() => {
                    const today = new Date();
                    const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                    const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
                    setTempStartDate(startOfLastMonth.toISOString().split('T')[0]);
                    setTempEndDate(endOfLastMonth.toISOString().split('T')[0]);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-secondary text-foreground text-sm"
                >
                  {language === 'zh' ? '上月' : 'Last Month'}
                </button>
              </div>
            </div>

            <div className="safe-area-bottom" />
          </div>
        </div>
      )}

      <DatePicker
        open={showStartDatePicker}
        value={tempStartDate}
        onChange={(date) => {
          setTempStartDate(date);
          setShowStartDatePicker(false);
        }}
        onClose={() => setShowStartDatePicker(false)}
      />

      <DatePicker
        open={showEndDatePicker}
        value={tempEndDate}
        onChange={(date) => {
          setTempEndDate(date);
          setShowEndDatePicker(false);
        }}
        onClose={() => setShowEndDatePicker(false)}
      />

      <OptionPicker
        open={showWalletPicker}
        value={filterWallet}
        onChange={setFilterWallet}
        onClose={() => setShowWalletPicker(false)}
        options={[
          { id: 'all', name: language === 'zh' ? '全部账户' : 'All Wallets' },
          ...wallets.map(w => ({ id: w.id, name: w.name, color: w.color }))
        ]}
        title={language === 'zh' ? '选择账户' : 'Select Wallet'}
      />

      <OptionPicker
        open={showPlatformPicker}
        value={filterPlatform}
        onChange={setFilterPlatform}
        onClose={() => setShowPlatformPicker(false)}
        options={[
          { id: 'all', name: language === 'zh' ? '全部平台' : 'All Platforms' },
          ...platforms.map(p => ({ id: p.id, name: tr.platforms[p.id as keyof typeof tr.platforms] || p.name, icon: p.icon }))
        ]}
        title={language === 'zh' ? '选择平台' : 'Select Platform'}
      />

      <OptionPicker
        open={showTypePicker}
        value={filterType}
        onChange={setFilterType}
        onClose={() => setShowTypePicker(false)}
        options={typeOptions}
        title={language === 'zh' ? '选择类型' : 'Select Type'}
      />
    </div>
  );
}
