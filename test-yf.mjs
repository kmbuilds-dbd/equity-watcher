import YahooFinance from 'yahoo-finance2';
const yf = new YahooFinance();
console.log('Keys:', Object.getOwnPropertyNames(Object.getPrototypeOf(yf)).join(', '));
console.log('Has chart:', typeof yf.chart);
console.log('Has historical:', typeof yf.historical);
console.log('Has quote:', typeof yf.quote);
