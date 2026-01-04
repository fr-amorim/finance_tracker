import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

async function checkChart() {
    try {
        const result = await yahooFinance.chart('AAPL', {
            period1: '2023-01-01',
            interval: '1d'
        });
        console.log('CHART RESULT Keys:', Object.keys(result));
        if (result.quotes && result.quotes.length > 0) {
            console.log('First quote:', result.quotes[0]);
        }
    } catch (e: any) {
        console.error('Error:', e.message);
    }
}

checkChart();
