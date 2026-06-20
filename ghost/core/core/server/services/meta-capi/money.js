// Stripe 官方「零小數位幣別」清單。這些幣別 amount 直接就是主單位（不需 /100）。
// 注意：TWD 不在此清單內——Stripe 把 TWD 當「兩小數位」幣別，NT$3,000 的
// amount = 300000。曾誤把 'twd' 放進來導致送給 Meta / PostHog 的金額全部 ×100，
// 已於 2026-06 移除。
const ZERO_DECIMAL_CURRENCIES = new Set([
    'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf',
    'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf'
]);

function normalizeCurrency(currency) {
    return typeof currency === 'string' ? currency.trim().toLowerCase() : null;
}

function centsToMajor(amount, currency) {
    if (typeof amount !== 'number') {
        return null;
    }

    const normalizedCurrency = normalizeCurrency(currency);
    if (!normalizedCurrency || ZERO_DECIMAL_CURRENCIES.has(normalizedCurrency)) {
        return amount;
    }

    return amount / 100;
}

module.exports = {
    centsToMajor
};
