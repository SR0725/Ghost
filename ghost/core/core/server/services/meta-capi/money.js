const ZERO_DECIMAL_CURRENCIES = new Set([
    'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf',
    'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf', 'twd'
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
