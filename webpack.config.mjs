/*
This is the configuration file for Webpack.
It's responsible for building the extension for different browsers,
including collecting multiple JS files into one and filling in manifest.json.
*/

import path from 'path';
import { fileURLToPath } from 'url';
import webpack from 'webpack';
import CopyPlugin from 'copy-webpack-plugin';
import TerserPlugin from 'terser-webpack-plugin';
import entryPlus from 'webpack-entry-plus';
import { glob } from 'glob';


// __dirname is not available in ESModules so we shim it
if (typeof __dirname !== 'string') global.__dirname = path.dirname(fileURLToPath(import.meta.url));


const __DEV__ = process.env.PRODUCTION_ENV !== 'true';
const mode = __DEV__ ? 'development' : 'production';

export const buildTargets = [
    'chrome',
    'firefox',
];

// This function returns a webpack config for a given build target.
// Packaging it this way allows us to build for multiple environments at once.
const exportForTarget = BUILD_TARGET => {
    const entryFiles = glob.sync('./src/**/*.target.js').map(file => `./${file}`); // Webpack wants all the paths to start with './'
    const entry = entryPlus([{
        entryFiles,
        outputName: item => item.replace(/\.target\.js$/i, '.js').replace(/^\.\/src\//, './'),
    }]);

    const output = {
        path: path.resolve(__dirname, __DEV__ ? 'dist-dev' : 'dist') + "/" + BUILD_TARGET,
        filename: '[name]',
        clean: true,
    };

    const moduleRules = [
        {
            test: /\.js$/i,
            enforce: "pre",
            use: ["source-map-loader"],
            exclude: /node_modules/,
        },
    ];

    const resolve = {
        alias: { '@guzztool': path.join(__dirname, 'src') },
        extensions: ['.js'],
    };


    const staticFileFilter = filepath => !(
        (filepath.endsWith('.js') && !/\blib\b/.test(filepath)) ||
        (entryFiles.some(e => path.relative(e, filepath) == ''))
    );
    const copyPatterns = [
        // Copy all static files
        {
            from: 'src',
            to: '.',
            filter: filepath => staticFileFilter(filepath) && filepath != 'src/manifest.json',
        },

        // Autofill manifest.json based on the target browser
        {
            from: 'src/manifest.json',
            to: 'manifest.json',
            transform: (content) => {
                const parsed = JSON.parse(content.toString());

                // Set some general fields from package.json into the manifest
                parsed.version = process.env.npm_package_version;
                parsed.description = process.env.npm_package_description;
                parsed.homepage_url = process.env.npm_package_homepage;

                // Autofill matches for content_scripts, web_accessible_resources, and externally_connectable
                for (const segment of [parsed.content_scripts, parsed.web_accessible_resources, parsed.externally_connectable]) {
                    if (segment) {
                        for (const subentry of Array.isArray(segment) ? segment : [segment]) {
                            subentry.matches = subentry.matches.flatMap(match => match == "<MATCHES>" ? parsed.MATCHES : match);
                        }
                    }
                }
                delete parsed.MATCHES;

                // All static files are web-accessible
                let web_accessible_resources = glob.sync('**/*', { cwd: path.resolve(__dirname, 'src'), nodir: true }).filter(staticFileFilter);
                // As are all source map files
                web_accessible_resources = web_accessible_resources.concat(glob.sync('**/*.js.map', { cwd: path.resolve(__dirname, 'src') }));
                // And also all target js files
                web_accessible_resources = web_accessible_resources.concat(Object.keys(entry).map(file => file.replace(/^\.\//, '')));
                // Now autofill the web_accessible_resources into the manifest
                for (const subentry of parsed.web_accessible_resources) {
                    subentry.resources = subentry.resources.flatMap(resource => resource == "<WEB ACCESSIBLE RESOURCES>" ? web_accessible_resources : resource);
                };

                if (BUILD_TARGET == 'chrome') {
                    // set to Manifest V3 (MV3) for Chrome
                    parsed.manifest_version = 3;

                    // applications is not used on Chrome
                    delete parsed.applications;

                    // remove MV2-specific background properties
                    delete parsed.background?.persistent;
                    delete parsed.background?.scripts;
                } else if (BUILD_TARGET == 'firefox') {
                    // set to Manifest V2 (MV2) for Firefox
                    parsed.manifest_version = 2;

                    // set Firefox-specific permissions
                    // const { permissions = [] } = applications.gecko;
                    // parsed.permissions.unshift(...permissions);
                    // delete applications.gecko.permissions;

                    // remove properties not used on Firefox
                    // Service worker is for Chrome, FireFox uses background/scripts
                    // delete parsed.background;
                    // delete parsed.action;

                    // remove properties not supported on MV2
                    delete parsed.externally_connectable;

                    // format web_accessible_resources in MV2's format
                    parsed.web_accessible_resources = parsed.web_accessible_resources.flatMap(resource => resource.resources);
                }

                return Buffer.from(JSON.stringify(parsed, null, __DEV__ ? 4 : 0));
            },
        },
    ];

    // These variables will be set in the extension scope
    const webpackEnv = {
        "GUZZTOOL.BUILD_TARGET": BUILD_TARGET,
    }

    const optimization = __DEV__ ? {} : {
        minimize: true,
        minimizer: [new TerserPlugin({
            "terserOptions": {
                "module": true, // this lets us use top-level awaits
                "mangle": { "reserved": ["browser", "chrome", "app", "battle"] } // Some variables are defined as globals by Showdown, we don't want to minify them
            }
        })],
    };

    const plugins = [
        new webpack.DefinePlugin(webpackEnv),
        new CopyPlugin({ patterns: copyPatterns }),
    ];


    // source maps for easier debugging of minified bundles
    // (values are based off of webpack's recommendations depending on the environment,
    // except for development, since we cannot use the webpack-recommended 'eval-source-map'
    // due to an 'unsafe-eval' EvalError thrown when trying to first init the extension)
    const devtool = __DEV__ ? 'cheap-module-source-map' : 'source-map';

    const config = {
        target: 'web',
        mode,
        entry,
        output,
        module: { rules: moduleRules },
        resolve,
        plugins,
        optimization,
        devtool,
    };

    return config;
}

const BUILD_TARGET = process.env.BUILD_TARGET ?? '*';
if (!buildTargets.includes(BUILD_TARGET) && BUILD_TARGET !== '*')
    throw Error(`Invalid BUILD_TARGET ${BUILD_TARGET}. Valid options: ${buildTargets.join(', ')}`);

let config;
if (BUILD_TARGET === '*') {
    config = buildTargets.map(target => exportForTarget(target));
} else {
    config = exportForTarget(BUILD_TARGET);
}

export default config;
