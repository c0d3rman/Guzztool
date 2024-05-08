import addonsLinter from 'addons-linter';

class WebpackAddonLinterPlugin {
    constructor(options) {
        this.options = options;
    }

    apply(compiler) {
        compiler.hooks.afterEmit.tap('AfterEmitPlugin', (compilation) => {
            addonsLinter.createInstance({
                config: {
                    _: [this.options.path],
                    logLevel: 'fatal',
                    stack: true,
                    shouldScanFile: fileName => fileName != 'static/lib/jquery.min.js',
                },
                runAsBinary: false, // This stops the linter from exiting the nodejs application
            }).run();
        });
    }
};

export default WebpackAddonLinterPlugin;
