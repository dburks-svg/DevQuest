// Echoes its arguments as JSON so tests can verify argv passes through the
// devquest wrapper unmodified (notably quoting on Windows).
console.log(JSON.stringify(process.argv.slice(2)));
