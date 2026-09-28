# Changelog

> 旧版记账应用更新历史；当前银行功能见 [仓库首页](../../README.md)。

All notable changes to UniTally are documented in this file.

## 2026-03-26 — Exchange rates & performance

### Added
- Date range filter for the expense category summary
- Data export and import feature (JSON)

### Fixed
- Support all currency pairs via EUR cross rates
- Restore exchange rate fetching with proper caching
- Revert exchange rate to a working version
- Improve performance and UI
- Remove unsupported currencies and time options

### Changed
- Add EUR cross-rate calculation for all currency pairs
- Switch to [open.er-api.com](https://open.er-api.com) for better exchange rates

## 2026-03-23 — Credit card reminder UI

### Added
- Wheel picker for credit card dates

### Fixed
- Reminder UI improvements
- Base iOS toggle style for the reminder switch

## 2026-03-22 — Credit cards & exchange rate display

### Added
- Billing day and due day for credit cards
- Credit card due reminder feature

### Fixed
- Exchange rate display shows 100 units conversion (like iMoney)

## 2026-03-21 — Wallet classification & transfer system

### Added
- Wallet classification system: Cash, Savings, Credit Card, and E-Wallet types
- Default cash accounts automatically created for all selected currencies during setup
- Wallet statistics with time range filters (Today, This Week, This Month, This Year, All Time) and pie charts
- Transfer system with a dedicated tab and cross-currency transfer support
- Transfer filter ("Transfers Only") in the transaction hall
- New categories: Drink, Fitness, Gift
- 31 currency colors based on each currency's largest denomination banknote
- Auto-colored cash wallets

## 2026-03-19 — Initial release

### Added
- Initial commit: UniTally — a multi-currency accounting book application
- Multi-currency support with real-time exchange rates
- Wallet management, transaction tracking, budget center, expense calendar, and data dashboard
- Multi-language support (Chinese / English)
- Multiple UI styles
- Project documentation and Firebase deployment setup
