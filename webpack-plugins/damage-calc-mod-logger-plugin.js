/**
 * Webpack plugin that instruments damage calculator files
 * to log modifier information to window.damageCalcModLog
 */

class DamageCalcModLoggerPlugin {
  apply(compiler) {
    // Add a custom loader for the damage calculator files
    const rawLoader = require.resolve('./damage-calc-mod-logger-loader.js');
    
    // Add loader for JavaScript files in the damage calculator
    compiler.options.module.rules.push({
      test: /@smogon\/calc\/dist\/mechanics\/.*\.js$/,
      use: [
        {
          loader: rawLoader,
          options: {}
        }
      ]
    });
    
    console.log('DamageCalcModLoggerPlugin: Added loaders for damage calculator files');
  }
}

module.exports = DamageCalcModLoggerPlugin;