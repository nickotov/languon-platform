const [label = 'fixture', durationValue = '100'] = process.argv.slice(2);
const duration = Number(durationValue);

console.log(`${label}: started`);
const interval = setInterval(() => console.log(`${label}: tick`), 150);
const complete = setTimeout(() => {
    clearInterval(interval);
    console.log(`${label}: completed`);
    process.exit(0);
}, duration);

function stop(signal) {
    clearInterval(interval);
    clearTimeout(complete);
    console.log(`${label}: stopped by ${signal}`);
    process.exit(0);
}

process.once('SIGINT', () => stop('SIGINT'));
process.once('SIGTERM', () => stop('SIGTERM'));
