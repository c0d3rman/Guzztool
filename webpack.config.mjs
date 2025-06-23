/*
This is the configuration file for Webpack.
It's responsible for building the extension for different browsers,
including collecting multiple JS files into one and filling in manifest.json.
*/

import path from 'path';
import fs from 'fs';
import _ from 'lodash';
import { fileURLToPath } from 'url';
import webpack from 'webpack';
import CopyPlugin from 'copy-webpack-plugin';
import TerserPlugin from 'terser-webpack-plugin';
import RemoveEmptyScriptsPlugin from 'webpack-remove-empty-scripts';
import WebExtPlugin from 'web-ext-plugin';
import HandlebarsPlugin from 'handlebars-webpack-plugin';
import RunCommandPlugin from '@radweb/webpack-run-command-plugin';
import getTargetFilepath from 'handlebars-webpack-plugin/utils/getTargetFilepath.js';
import entryPlus from 'webpack-entry-plus';
import { glob } from 'glob';
import SUBTOOL_ORDER from './src/subtools/subtool_order.json' with { type: "json" };


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
    // Get all JS & CSS files to build
    const entry = entryPlus([
        { // JS - we build any file ending in .target.js
            entryFiles: glob.sync('./src/**/*.target.js').map(file => `./${file}`), // Webpack wants all the paths to start with './'
            outputName: item => item.replace(/\.target\.js$/i, '').replace(/^\.\/src\//, './'), // ./src/foo/bar.target.js => ./foo/bar (webpack will append the extension)
        },
        { // CSS - we build .sass and .scss files
            entryFiles: glob.sync('./src/**/*.s[ac]ss').map(file => `./${file}`),
            // webpack always expects to build a JS file, even if it's empty (since we're building CSS),
            // so we create this and webpack-remove-empty-scripts deletes it
            outputName: 'STYLES_DUMMY_DELETE_ME',
        },
        { // Special JS files that need SUBTOOLS data
            entryFiles: ['./src/options/subtools-data.js'],
            outputName: 'options/subtools-data',
        },
    ]);

    const output = {
        path: path.join(path.resolve(__dirname, __DEV__ ? 'dist-dev' : 'dist'), BUILD_TARGET),
        clean: true, // clears out the build folder before building
    };

    const SUBTOOLS = fs.readdirSync(path.join(__dirname, "src", "subtools"), { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .reduce((acc, dirent) => {
            acc[dirent.name] = JSON.parse(fs.readFileSync(path.join(__dirname, "src", "subtools", dirent.name, "subtool.json"), 'utf8'));;
            acc[dirent.name].id = dirent.name;
            acc[dirent.name].iconPath = path.join("/subtools", dirent.name, acc[dirent.name].icon);
            return acc;
        }, {});
    SUBTOOLS["_guzztool"] = { // A fake "subtool" which represents the global Guzztool, so we can have settings for it
        id: "_guzztool",
        name: "Guzztool",
        color: "#45474c",
        description: "Global Guzztool settings",
        icon: "icon.svg",
        iconPath: "/static/icons/icon.svg",
        matches: [],
        settings: [
            {
                "id": "debug",
                "type": "boolean",
                "title": "Enable debug mode.",
                "default": false
            },
        ],
    };
    if (!_.isEmpty(_.xor(Object.keys(SUBTOOLS), SUBTOOL_ORDER)))
        throw Error(`Some keys are in only one of SUBTOOLS or SUBTOOL_ORDER: ${_.xor(Object.keys(SUBTOOLS), SUBTOOL_ORDER)}`);

    const handlebarsPluginConfig = {
        entry: path.join(__dirname, "src", "**", "*.target.handlebars"),
        output: path.join(output.path, "[path]", "[name].html"),
        getTargetFilepath: (filepath, outputTemplate, rootFolder) => {
            filepath = filepath.replace(/\.target\.handlebars$/, '.handlebars');
            return getTargetFilepath(filepath, outputTemplate, rootFolder);
        },
        getPartialId: (filePath) => {
            // All partial IDs are their paths relative to src, without the file extension
            // e.g. '{__dirname}/src/options/grid.handlebars' => 'options/grid'
            const relative = path.parse(path.relative('src', filePath));
            return path.join(relative.dir, relative.name);
        },
        partials: glob.sync(path.join(__dirname, "src", "**", "*.handlebars")).filter(f => !f.endsWith('.target.handlebars')),
        helpers: { all: path.join(__dirname, "handlebars_helpers", "*.js") },
        data: {
            subtools: SUBTOOLS,
            subtool_order: SUBTOOL_ORDER,
        },
    };

    // A map from partial IDs to partial paths, e.g. 'options/grid' => '{__dirname}/src/options/grid.handlebars'
    // Used so handlebars-loader (which handles handlebars imports in JS files) can resolve partials using the same scheme as handlebars-webpack-plugin (which handles building handlebars files into HTML files)
    const partialMap = Object.fromEntries(handlebarsPluginConfig.partials.map(partialPath => [handlebarsPluginConfig.getPartialId(partialPath), partialPath]));

    const moduleRules = [
        { // build source maps for JS files
            test: /\.js$/i,
            enforce: "pre",
            loader: "source-map-loader",
            exclude: /node_modules/,
        },
        { // build CSS files
            test: /\.s[ac]ss$/i,
            use: [
                {
                    loader: 'file-loader',
                    options: {
                        name: '[name].css',
                        outputPath: (name, resourcePath) => path.join(path.relative('src', path.dirname(resourcePath)), name),
                    }
                },
                "sass-loader",
            ],
        },
        { // load Handlebars files
            test: /\.handlebars$/,
            loader: 'handlebars-loader',
            options: {
                partialResolver: (partial, callback) => callback(null, partialMap[partial]),
                helperDirs: [path.join(__dirname, 'handlebars_helpers')],
            },
        }
    ];

    const resolve = {
        alias: { '@guzztool': path.join(__dirname, 'src') }, // You can use @guzztool as a root path in imports
        extensions: ['.js'], // If you don't give an extension in an import, webpack will look for a .js file
    };

    const isStaticFile = filepath => !(
        filepath == 'src/manifest.json' || // The manifest is not static
        (filepath.endsWith('.js') && !/(?:^|\/)lib\//i.test(filepath)) || // JS files are not static unless they're in a lib/ folder
        filepath.endsWith('.handlebars') || // Handlebars templates are not static
        Object.values(entry).flat().some(e => path.relative(e, filepath) == '') || // Any file which is an entry point is not static (since it gets built)
        path.basename(filepath) == '.DS_Store' // .DS_Store files are not static
    );
    const copyPatterns = [
        // Copy all static files
        {
            from: 'src',
            to: '.',
            filter: isStaticFile,
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
                const gatheredMathes = [...new Set(Object.values(SUBTOOLS).map(subtool => subtool.matches).flat())];
                for (const segment of [parsed.content_scripts, parsed.web_accessible_resources, parsed.externally_connectable]) {
                    if (segment) {
                        for (const subentry of Array.isArray(segment) ? segment : [segment]) {
                            subentry.matches = subentry.matches.flatMap(match => match == "<MATCHES>" ? gatheredMathes : match);
                        }
                    }
                }

                // All static files are web-accessible
                let web_accessible_resources = glob.sync('**/*', { cwd: path.resolve(__dirname, 'src'), nodir: true })
                    .filter(f => isStaticFile(path.join('src', f))); // isStaticFile expects 'src' in the path but the output shouldn't have it, so we do this
                // As are all source map files
                web_accessible_resources = web_accessible_resources.concat(glob.sync('**/*.js.map', { cwd: path.resolve(__dirname, output.path) }));
                // And also all target js files
                web_accessible_resources = web_accessible_resources.concat(Object.entries(entry)
                    .map(([k, v]) => typeof v == 'string' ? [[k, v]] : v.map(v2 => [k, v2])).flat()
                    .filter(([k, v]) => v.endsWith(".target.js"))
                    .map(([k, v]) => k.replace(/^\.\//, '') + ".js"));
                // Encode all spaces and such in web_accessible_resources
                web_accessible_resources = web_accessible_resources.map(encodeURI);
                // Now autofill the web_accessible_resources into the manifest
                for (const subentry of parsed.web_accessible_resources) {
                    subentry.resources = subentry.resources.flatMap(resource => resource == "<WEB ACCESSIBLE RESOURCES>" ? web_accessible_resources : resource);
                };

                if (BUILD_TARGET == 'chrome') {
                    // Set to Manifest V3 (MV3) for Chrome
                    parsed.manifest_version = 3;

                    // Delete browser_specific_settings, which Chrome doesn't recognize
                    delete parsed.browser_specific_settings;
                } else if (BUILD_TARGET == 'firefox') {
                    // Set to Manifest V2 (MV2) for Firefox
                    parsed.manifest_version = 2;

                    // Firefox doesn't support service workers, so convert them to background scripts
                    if (parsed.background?.service_worker) {
                        parsed.background.scripts = [parsed.background.service_worker];
                        delete parsed.background.service_worker;
                    }

                    // Remove properties not supported by firefox
                    delete parsed.externally_connectable;
                    if (parsed.permissions) parsed.permissions = parsed.permissions.filter(permission => permission !== "offscreen");

                    // Format web_accessible_resources for MV2
                    parsed.web_accessible_resources = parsed.web_accessible_resources.flatMap(resource => resource.resources);

                    // Move host_permissions into permissions for MV2
                    if (parsed.host_permissions) {
                        parsed.permissions = (parsed.permissions || []).concat(parsed.host_permissions);
                        delete parsed.host_permissions;
                    }
                }

                return Buffer.from(JSON.stringify(parsed, null, __DEV__ ? 4 : 0));
            },
        },
    ];

    const optimization = __DEV__ ? {} : {
        minimize: true,
        minimizer: [new TerserPlugin({
            "terserOptions": {
                "module": true, // this lets us use top-level awaits
                "mangle": { "reserved": ["browser", "chrome", "app", "battle"] } // Some variables are defined as globals by Showdown, we don't want to minify them
            }
        })],
    };

    // These keywords will be replaced with the given strings in all JS files
    const webpackEnv = {
        BUILD_TARGET: `'${BUILD_TARGET}'`,
        __DEV__: `'${__DEV__}'`,
        SUBTOOLS: JSON.stringify(SUBTOOLS),
        SUBTOOL_ORDER: JSON.stringify(SUBTOOL_ORDER),
    }

    const plugins = [
        new webpack.DefinePlugin(webpackEnv),
        new CopyPlugin({ patterns: copyPatterns }),
        new RemoveEmptyScriptsPlugin(),
        new HandlebarsPlugin(handlebarsPluginConfig),
    ];
    if (BUILD_TARGET == 'chrome') {
        if (!__DEV__) {
            plugins.push(new RunCommandPlugin({
                stage: 'done',
                run: [{
                    cmd: `zip -r ../${BUILD_TARGET}.zip *`,
                    opts: { cwd: output.path },
                }],
            }));
        }
    } else if (BUILD_TARGET == 'firefox') {
        plugins.push(new WebExtPlugin({
            sourceDir: output.path,
            artifactsDir: path.dirname(output.path),
            outputFilename: BUILD_TARGET + ".zip",
            runLint: __DEV__, // in production mode buildPackage already lints
            buildPackage: !__DEV__,
            overwriteDest: true,
            firefox: '/usr/bin/true', // this plugin launches Firefox when running in :watch mode (which we don't want), so we tell it "Firefox" is this noop binary
            noInput: false, // true by default in watch mode, so we set it to false (though we don't really use it)
        }));
    }

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
        performance: { maxAssetSize: 1000000000000 },
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
