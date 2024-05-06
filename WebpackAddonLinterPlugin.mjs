import addonsLinter from 'addons-linter';

class WebpackAddonLinterPlugin {
    constructor(options) {
        this.options = options;
        this.linter = addonsLinter.createInstance({
            config: {
                _: [this.options.path],
                logLevel: 'debug',
                stack: true,
                shouldScanFile: fileName => fileName != 'static/lib/jquery.min.js',
            },
            runAsBinary: false, // This stops the linter from exiting the nodejs application
        });
    }

    apply(compiler) {
        compiler.hooks.afterEmit.tap('AfterEmitPlugin', (compilation) => {
            this.linter.run();
        });
    }
};

export default WebpackAddonLinterPlugin;
