"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const schema_utils_1 = require("schema-utils");
const svgo_1 = require("svgo");
const cheerio = __importStar(require("cheerio"));
const globby_1 = __importDefault(require("globby"));
const ConstDependency_1 = __importDefault(require("webpack/lib/dependencies/ConstDependency"));
const NullFactory_1 = __importDefault(require("webpack/lib/NullFactory"));
// schema for options object
const schema = {
    path: "string",
    fileName: "string",
    inlineSvg: "boolean",
    removeViewBox: "boolean",
    prefix: "string",
};
// Defaults
const defaults = {
    path: "/**/*.svg",
    fileName: "svg-sprites.svg",
    inlineSvg: false,
    removeViewBox: false,
    prefix: "",
    publicPath: "",
};
class WebpackSvgStore {
    constructor(options = {}, tasks = {}) {
        this.tasks = tasks;
        this.options = defaults;
        this.options = Object.assign(Object.assign({}, this.options), options);
        (0, schema_utils_1.validate)(schema, this.options, {
            name: "WebpackSvgStore",
            baseDataPath: "options",
        });
    }
    addTask(file, value) {
        this.tasks[file]
            ? this.tasks[file].push(value)
            : (() => {
                this.tasks[file] = [];
                this.tasks[file].push(value);
            })();
    }
    minify(file, removeViewBox) {
        const plugins = [
            { name: "removeTitle" },
            { name: "collapseGroups" },
            { name: "inlineStyles" },
            { name: "convertStyleToAttrs" },
            { name: "cleanupIDs" },
        ];
        if (removeViewBox) {
            plugins.push({ name: "removeViewBox" });
        }
        const result = (0, svgo_1.optimize)(file, { plugins });
        return result.data;
    }
    convertFilenameToId(filename, prefix) {
        return prefix + filename.split(".").join("-").toLowerCase();
    }
    /**
     * [parseFiles description]
     * @return {[type]} [description]
     */
    parseFiles(files, options) {
        let resultSvg = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><defs/></svg>';
        if (!options.inlineSvg) {
            resultSvg =
                '<?xml version="1.0" encoding="UTF-8"?>' +
                    '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" ' +
                    '"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">' +
                    resultSvg;
        }
        const $ = cheerio.load(resultSvg, { xml: true });
        const $combinedSvg = $("svg");
        const $combinedDefs = $("defs");
        files.forEach((file) => {
            // load and minify
            const buffer = this.minify(fs_1.default.readFileSync(file, "utf8"), options.removeViewBox);
            // get filename for id generation
            const filename = path_1.default.basename(file, ".svg");
            const $svg = cheerio.load(buffer.toString(), { xml: true })("svg");
            if ($svg.length === 0)
                return;
            const idAttr = this.convertFilenameToId(filename, `${options.prefix}`);
            const viewBoxAttr = $svg.attr("viewBox");
            const preserveAspectRatioAttr = $svg.attr("preserveAspectRatio");
            const $symbol = $("<symbol/>");
            $symbol.attr("id", idAttr);
            if (viewBoxAttr) {
                $symbol.attr("viewBox", viewBoxAttr);
            }
            if (preserveAspectRatioAttr) {
                $symbol.attr("preserveAspectRatio", preserveAspectRatioAttr);
            }
            const $defs = $svg.find("defs");
            if ($defs.length > 0) {
                $combinedDefs.append($defs.contents());
                $defs.remove();
            }
            $symbol.append($svg.contents());
            $combinedSvg.append($symbol);
        });
        return $.xml();
    }
    createTaskContext() {
        const files = globby_1.default.sync(this.options.path.replace(/\\/g, "/"));
        const fileContent = this.parseFiles(files, this.options);
        this.addTask(this.options.path, {
            fileContent,
            fileName: this.options.fileName,
        });
    }
    getPublicPath(compilation) {
        const webpackPublicPath = compilation.getAssetPath(compilation.outputOptions.publicPath, { hash: compilation.hash });
        let publicPath = webpackPublicPath !== "auto"
            ? webpackPublicPath
            : path_1.default
                .relative(path_1.default.resolve(compilation.options.output.path), compilation.options.output.path)
                .split(path_1.default.sep)
                .join("/");
        if (publicPath.length && !publicPath.endsWith("/")) {
            publicPath += "/";
        }
        return publicPath;
    }
    apply(compiler) {
        const { webpack: { sources, Compilation }, } = compiler;
        const { RawSource } = sources;
        compiler.hooks.thisCompilation.tap("WebpackSvgStore", (compilation) => {
            this.options.publicPath = this.getPublicPath(compilation);
            compilation.dependencyFactories.set(ConstDependency_1.default, new NullFactory_1.default());
            compilation.dependencyTemplates.set(ConstDependency_1.default, new ConstDependency_1.default.Template());
            this.createTaskContext();
            compilation.hooks.processAssets.tap({
                name: "WebpackSvgStore",
                stage: Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
            }, () => {
                Object.keys(this.tasks).map((key) => __awaiter(this, void 0, void 0, function* () {
                    this.tasks[key].forEach((task) => {
                        compilation.emitAsset(task.fileName, new RawSource(task.fileContent));
                    });
                }));
            });
        });
        compiler.hooks.done.tap("WebpackSvgStore", () => {
            this.tasks = {};
        });
    }
}
module.exports = WebpackSvgStore;
