module.exports = function concat(...args) {
    return args.filter(arg => typeof arg !== 'object').join('');
}
