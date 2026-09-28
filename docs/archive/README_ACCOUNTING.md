# UniTally

> **历史存档，不是当前启动指南。** 原记账应用的功能、定价及部署说明不代表当前银行比赛原型。请从 [新版首页](../../README.md) 进入；原启动脚本仅以文本形式保存在 `archive/launchers/`。

> 质量迭代资料：[说明](../development/BANK_QUALITY_PROGRESS.md)。

> 当前银行原型的开发指南：[安装说明](../development/BANK_AGENT_DEMO.md)。

An accounting book application that supports multiple currencies.

UniTally helps you track income and expenses across different currencies with real-time exchange rates, manage wallets, set budgets, track subscriptions, and visualize your spending — all in a clean, customizable interface.

> 📋 See [CHANGELOG.md](CHANGELOG.md) for the full update history.

## Features

### Multi-Currency Accounting
- Track income and expenses in **27 supported currencies**
- Real-time exchange rates with automatic cross-rate calculation for all currency pairs
- Each currency has a distinct color based on its largest denomination banknote
- Cross-currency transfers with separate amount fields per currency

### Wallet Management
- Create and manage multiple wallets with custom icons and colors
- Wallet types: **Cash**, **Savings**, **Credit Card**, and **E-Wallet**
- Cash wallets are automatically created for your selected currencies during setup
- Credit cards display available credit (limit + balance) instead of current balance
- Wallet picker groups options by type
- Click any wallet to view an expense breakdown by category, filterable by time range (Today, This Week, This Month, This Year, All Time) with pie charts

### Transaction Tracking
- Record income and expenses with categories, notes, and timestamps
- Dedicated **transfer** tab for moving money between wallets (transfers are excluded from expense statistics)
- Filter by type, category, wallet, and platform
- 15 built-in categories (Food, Transport, Shopping, Housing, Entertainment, Medical, Education, Grocery, Drink, Fitness, Gift, Telecom, Clothing, Social, Other) — fully customizable
- Transfer-only filter in the transaction hall

### Budget Center
- Set budgets with amount, category, date range, and notes
- Visual progress tracking with spent / remaining / over-budget states
- **Subscription tracking** with providers, billing cycles, and amounts

### Analytics & Visualization
- **Data Dashboard**: total assets, monthly income/expense, asset trends, and category distribution charts
- **Expense Calendar**: visualize daily spending patterns with daily breakdowns and monthly stats
- **Exchange rate chart** with historical periods

### Data Management
- Data **export** (JSON) and **import** (premium)
- Email verification and password recovery (forgot / reset password)

### Customization
- Light / dark themes with 6 accent colors
- **4 UI styles**: Minimalist, Neumorphism, Brutalism, Cyberpunk
- Bilingual interface (Chinese / English)
- Custom avatar, book name, and notification center (credit card due reminders)

## UI Styles

| Style | Description | Availability |
|---|---|---|
| Minimalist (极简) | Clean, simple design focused on content | Free |
| Neumorphism (新拟态) | Soft UI with subtle shadows and embossed effects | Free |
| Brutalism (粗野主义) | Bold, high-contrast design with thick borders and sharp edges | Premium |
| Cyberpunk (赛博朋克) | Neon-lit futuristic design with flowing gradients and glow effects | Premium |

## Pricing Plans

| Feature | Free | Premium |
|---|---|---|
| Wallets | 3 | Unlimited |
| Transactions / month | 100 | Unlimited |
| Budgets | 3 | Unlimited |
| Subscription tracking | 3 | Unlimited |
| Data export | ✗ | ✓ |
| Premium UI styles | ✗ | ✓ |

Premium: **$2.99/month** · **$29.99/quarter** · **$35.99/lifetime**

## Quick Start (Windows, one-click)

1. Double-click **`一键启动.bat`** — it checks Node.js, installs dependencies if needed, starts the backend (port 5000) and frontend (port 8080), then opens the browser automatically.
2. Double-click **`停止服务.bat`** to stop all services and close the server windows.

## Getting Started (Manual)

### Prerequisites

- Node.js 18+
- npm or bun

### Installation

```bash
# Clone the repository
git clone https://github.com/baiyizhuoait-ui/UniTally.git
cd UniTally

# Install frontend dependencies
npm install

# Install backend dependencies
cd backend && npm install

# Start backend server (port 5000)
npm start

# In another terminal, start frontend (port 8080)
cd .. && npm run dev
```

### Configuration

1. Copy `.env.example` to `.env` and fill in your credentials
2. Configure Firebase credentials for authentication
3. Set up Brevo SMTP for email verification

## Project Structure

```
├── src/          # Frontend (React + TypeScript + Vite)
│   ├── components/   # UI components & feature modals
│   ├── contexts/     # App & subscription state
│   ├── lib/          # Utilities (currencies, i18n, plans, storage)
│   └── pages/        # Application pages
├── backend/      # Backend API (Node.js + Express)
├── functions/    # Firebase Cloud Functions
└── public/       # Static assets
```

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **UI**: shadcn-ui + Tailwind CSS
- **Backend**: Node.js + Express
- **Auth**: Firebase Authentication + email verification
- **Email**: Brevo SMTP

## License

MIT
