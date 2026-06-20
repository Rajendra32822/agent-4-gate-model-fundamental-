/**
 * Exporter utility to generate Zerodha Kite and AngelOne compatible basket order CSVs.
 */

/**
 * Calculates share quantity based on the total allocation (default ₹1,00,000) and the signal price.
 */
export function calculateQuantity(price, allocation = 100000) {
  if (!price || price <= 0) return 1;
  const qty = Math.floor(allocation / price);
  return qty > 0 ? qty : 1;
}

/**
 * Exports selected signals as a Zerodha Kite CSV basket.
 * Columns: TICKER,EXCHANGE,TRANSACTION_TYPE,PRODUCT,ORDER_TYPE,QUANTITY,PRICE
 */
export function exportZerodhaKite(signals, allocation) {
  const headers = ['TICKER', 'EXCHANGE', 'TRANSACTION_TYPE', 'PRODUCT', 'ORDER_TYPE', 'QUANTITY', 'PRICE'];
  
  const rows = signals.map(sig => {
    // Strip indices or suffixes if any, Zerodha uses raw symbol names (e.g. TCS for TCS.NS)
    const rawTicker = sig.ticker.replace(/\.(NS|BO)$/i, '').toUpperCase();
    const qty = calculateQuantity(sig.price, allocation);
    
    return [
      rawTicker,
      'NSE',
      sig.signal_type, // 'BUY' or 'SELL'
      'CNC', // Cash & Carry (Delivery)
      'LIMIT',
      qty,
      sig.price
    ];
  });

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  downloadCSV(csvContent, 'zerodha_kite_basket.csv');
}

/**
 * Exports selected signals as an AngelOne CSV basket.
 * Columns: SymbolName,Exchange,Action,ProductType,OrderType,Quantity,LimitPrice,TriggerPrice
 */
export function exportAngelOne(signals, allocation) {
  const headers = ['SymbolName', 'Exchange', 'Action', 'ProductType', 'OrderType', 'Quantity', 'LimitPrice', 'TriggerPrice'];
  
  const rows = signals.map(sig => {
    const rawTicker = sig.ticker.replace(/\.(NS|BO)$/i, '').toUpperCase() + '-EQ'; // AngelOne uses symbol-EQ for equity delivery
    const qty = calculateQuantity(sig.price, allocation);
    
    return [
      rawTicker,
      'NSE',
      sig.signal_type, // 'BUY' or 'SELL'
      'DELIVERY',
      'LIMIT',
      qty,
      sig.price,
      0 // No trigger price for limit order
    ];
  });

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  downloadCSV(csvContent, 'angelone_basket.csv');
}

function downloadCSV(content, filename) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
