import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import CategoryIcon from '@/components/CategoryIcon';
import { Sun, Moon, X, Plus, Trash2, ArrowUp, ArrowDown, GripVertical, Crown, Download } from 'lucide-react';
import AddCategoryModal from './AddCategoryModal';
import AddPlatformModal from './AddPlatformModal';
import UpgradeModal from './UpgradeModal';
import DataExportImport from './DataExportImport';
import { translations } from '@/lib/i18n';

interface Props {
  open: boolean;
  onClose: () => void;
}

type SettingsTab = 'appearance' | 'platforms' | 'categories' | 'data';

export default function SettingsModal({ open, onClose }: Props) {
  const app = useApp();
  const { t, language } = app;
  const tr = translations[language];
  const [tab, setTab] = useState<SettingsTab>('appearance');
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [showAddPlatform, setShowAddPlatform] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);

  if (!open) return null;

  const tabs: { key: SettingsTab; label: string }[] = [
    { key: 'appearance', label: t.settings.appearance },
    { key: 'platforms', label: t.settings.platforms },
    { key: 'categories', label: t.settings.categories },
    { key: 'data', label: language === 'zh' ? '数据导出' : 'Data Export' },
  ];

  const themeOptions: [string, string, typeof Sun][] = [
    ['light', t.settings.light, Sun],
    ['dark', t.settings.dark, Moon],
  ];

  const themeColors = [
    { key: 'blue', label: t.settings.blue, light: '221 83% 53%', dark: '217 91% 60%' },
    { key: 'rose', label: t.settings.rose, light: '346 77% 50%', dark: '346 77% 60%' },
    { key: 'green', label: t.settings.green, light: '160 84% 39%', dark: '160 84% 45%' },
    { key: 'violet', label: t.settings.violet, light: '263 70% 50%', dark: '263 70% 60%' },
    { key: 'amber', label: t.settings.amber, light: '38 92% 50%', dark: '38 92% 55%' },
    { key: 'teal', label: t.settings.teal, light: '183 74% 40%', dark: '183 74% 50%' },
  ];

  const moveCategory = (idx: number, dir: -1 | 1) => {
    const sorted = [...app.categories].sort((a, b) => a.order - b.order);
    const target = idx + dir;
    if (target < 0 || target >= sorted.length) return;
    const temp = sorted[idx].order;
    sorted[idx] = { ...sorted[idx], order: sorted[target].order };
    sorted[target] = { ...sorted[target], order: temp };
    app.reorderCategories(sorted);
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
        <div className="fixed inset-0 bg-foreground/20 backdrop-blur-sm modal-overlay" />
        <div
          className="relative w-full max-w-md max-h-[85vh] overflow-auto glass-card rounded-3xl modal-content"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold text-foreground">{t.settings.title}</h2>
            <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-secondary transition-colors">
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>

          <div className="flex gap-2 mb-5">
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-2 rounded-2xl text-sm font-medium transition-all duration-200 ${
                  tab === t.key ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'appearance' && (
            <div className="space-y-5">
              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">{t.settings.theme}</label>
                <div className="flex gap-2">
                  {themeOptions.map(([mode, label, Icon]) => (
                    <button
                      key={mode}
                      onClick={() => app.setTheme(mode as 'light' | 'dark')}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm transition-all ${
                        app.theme === mode ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">{t.settings.themeColor}</label>
                <div className="flex gap-2.5 flex-wrap">
                  {themeColors.map(c => {
                    const isActive = app.themeColor === c.key;
                    const colorHsl = app.theme === 'dark' ? c.dark : c.light;
                    return (
                      <button
                        key={c.key}
                        onClick={() => app.setThemeColor(c.key)}
                        className={`flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all duration-200 ${
                          isActive ? 'ring-2 ring-offset-2 ring-offset-background' : 'hover:scale-105'
                        }`}
                        style={{ ['--tw-ring-color' as string]: `hsl(${colorHsl})` }}
                        title={c.label}
                      >
                        <div
                          className="w-8 h-8 rounded-full shadow-sm"
                          style={{ background: `hsl(${colorHsl})` }}
                        />
                        <span className="text-[10px] text-muted-foreground">{c.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">{t.settings.uiStyle || '界面风格'}</label>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => app.setUIStyle('default')}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm transition-all ${
                      app.uiStyle === 'default' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
                    }`}
                  >
                    <div className="w-4 h-4 rounded border border-current" />
                    {t.settings.defaultStyle || '极简'}
                  </button>
                  <button
                    onClick={() => app.setUIStyle('neumorphism')}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm transition-all ${
                      app.uiStyle === 'neumorphism' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
                    }`}
                  >
                    <div className="w-4 h-4 rounded-full bg-gradient-to-br from-white/50 to-black/10 shadow-sm" />
                    {t.settings.neumorphism || '新拟态'}
                  </button>
                  <button
                    onClick={() => {
                      if (!app.isPremium) {
                        setShowUpgrade(true);
                        return;
                      }
                      app.setUIStyle('brutalism');
                    }}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm transition-all ${
                      app.uiStyle === 'brutalism' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
                    }`}
                  >
                    <div className="w-4 h-4 relative">
                      <div className="absolute inset-0 bg-black" style={{ clipPath: 'polygon(0 0, 100% 20%, 80% 100%, 10% 80%)' }} />
                    </div>
                    {t.settings.brutalism || '粗野主义'}
                    {!app.isPremium && <Crown className="w-3 h-3 text-amber-500" />}
                  </button>
                  <button
                    onClick={() => {
                      if (!app.isPremium) {
                        setShowUpgrade(true);
                        return;
                      }
                      app.setUIStyle('cyberpunk');
                    }}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm transition-all ${
                      app.uiStyle === 'cyberpunk' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
                    }`}
                  >
                    <div className="w-4 h-4 rounded-lg bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-400 animate-pulse" />
                    {t.settings.cyberpunk || '赛博朋克'}
                    {!app.isPremium && <Crown className="w-3 h-3 text-amber-500" />}
                  </button>
                </div>
              </div>
            </div>
          )}

          {tab === 'platforms' && (
            <div className="space-y-3">
              {app.platforms.map(p => {
                const translatedName = tr.platforms[p.id as keyof typeof tr.platforms] || p.name;
                return (
                  <div key={p.id} className="flex items-center gap-3 bg-secondary rounded-2xl p-3">
                    <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                    <span className="flex-1 text-sm text-foreground">{translatedName}</span>
                    <button onClick={() => app.deletePlatform(p.id)} className="text-muted-foreground hover:text-expense transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
              <button
                onClick={() => setShowAddPlatform(true)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-muted text-muted-foreground hover:border-primary hover:text-primary transition-all duration-200"
              >
                <Plus className="w-4 h-4" />
                <span className="text-sm font-medium">{t.settings.addPlatform}</span>
              </button>
              <button
                onClick={() => app.resetPlatforms()}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground transition-all duration-200"
              >
                <span className="text-sm">{language === 'zh' ? '恢复默认平台' : 'Reset to Default Platforms'}</span>
              </button>
            </div>
          )}

          {tab === 'categories' && (
            <div className="space-y-2">
              {[...app.categories].sort((a, b) => a.order - b.order).map((c, idx) => {
                const translatedName = tr.categories[c.id as keyof typeof tr.categories] || c.name;
                return (
                  <div key={c.id} className="flex items-center gap-2 bg-secondary rounded-2xl p-3">
                    <GripVertical className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <CategoryIcon icon={c.icon} color={c.color} size={20} />
                    <span className="flex-1 text-sm text-foreground">{translatedName}</span>
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: c.color }} />
                    <button onClick={() => moveCategory(idx, -1)} className="text-muted-foreground hover:text-foreground">
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => moveCategory(idx, 1)} className="text-muted-foreground hover:text-foreground">
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    {c.id !== 'transfer' && (
                      <button onClick={() => app.deleteCategory(c.id)} className="text-muted-foreground hover:text-expense">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
              <button
                onClick={() => setShowAddCategory(true)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-muted text-muted-foreground hover:border-primary hover:text-primary transition-all duration-200"
              >
                <Plus className="w-4 h-4" />
                <span className="text-sm font-medium">{t.settings.addCategory}</span>
              </button>
              <button
                onClick={() => app.resetCategories()}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground transition-all duration-200"
              >
                <span className="text-sm">{language === 'zh' ? '恢复默认分类' : 'Reset to Default Categories'}</span>
              </button>
            </div>
          )}

          {tab === 'data' && (
            <DataExportImport />
          )}
        </div>
      </div>

      <AddCategoryModal
        open={showAddCategory}
        onClose={() => setShowAddCategory(false)}
        onAdd={(data) => {
          const maxOrder = Math.max(...app.categories.map(c => c.order), -1);
          app.addCategory({ ...data, order: maxOrder + 1 });
          setShowAddCategory(false);
        }}
      />

      <AddPlatformModal
        open={showAddPlatform}
        onClose={() => setShowAddPlatform(false)}
        onAdd={(data) => {
          app.addPlatform(data);
          setShowAddPlatform(false);
        }}
      />

      <UpgradeModal
        open={showUpgrade}
        onClose={() => setShowUpgrade(false)}
      />
    </>
  );
}
