import fs from "fs";
import path from "path";
import { validate } from "schema-utils";
import { optimize, OptimizedSvg, Plugin } from "svgo";
import * as cheerio from 'cheerio';
import globby from "globby";
import ConstDependency from "webpack/lib/dependencies/ConstDependency";
import NullFactory from "webpack/lib/NullFactory";
import { Compilation, Compiler } from "webpack";

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

type WebpackSvgStoreOptions = {
  path?: string;
  fileName?: string;
  inlineSvg?: boolean;
  removeViewBox?: boolean;
  prefix?: string;
  publicPath?: string;
};

type TaskValue = { fileContent: string; fileName: string };

interface IWebpackSvgStore {
  options: WebpackSvgStoreOptions;
  tasks: { [file: string]: TaskValue[] };
}

class WebpackSvgStore implements IWebpackSvgStore {
  options: Required<WebpackSvgStoreOptions> = defaults;

  constructor(
    options: WebpackSvgStoreOptions = {},
    public tasks: { [key: string]: TaskValue[] } = {}
  ) {
    this.options = { ...this.options, ...options };

    validate(schema, this.options, {
      name: "WebpackSvgStore",
      baseDataPath: "options",
    });
  }

  addTask(file: string, value: TaskValue) {
    this.tasks[file]
      ? this.tasks[file].push(value)
      : (() => {
          this.tasks[file] = [];
          this.tasks[file].push(value);
        })();
  }

  minify(file: string, removeViewBox: boolean) {
    const plugins: Plugin[] = [
      { name: "removeTitle" },
      { name: "collapseGroups" },
      { name: "inlineStyles" },
      { name: "convertStyleToAttrs" },
      { name: "cleanupIDs" },
    ];

    if (removeViewBox) {
      plugins.push({ name: "removeViewBox" });
    }

    const result = optimize(file, { plugins }) as OptimizedSvg;

    return result.data;
  }

  convertFilenameToId(filename: string, prefix: string) {
    return prefix + filename.split(".").join("-").toLowerCase();
  }

  /**
   * [parseFiles description]
   * @return {[type]} [description]
   */
  parseFiles(files: string[], options: Required<WebpackSvgStoreOptions>) {
    let resultSvg =
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><defs/></svg>';
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
      const buffer = this.minify(
        fs.readFileSync(file, "utf8"),
        options.removeViewBox
      );

      // get filename for id generation
      const filename = path.basename(file, ".svg");

      const $svg = cheerio.load(buffer.toString(), { xml: true })("svg");

      if ($svg.length === 0) return;

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
    const files = globby.sync(this.options.path.replace(/\\/g, "/"));
    const fileContent = this.parseFiles(files, this.options);

    this.addTask(this.options.path, {
      fileContent,
      fileName: this.options.fileName,
    });
  }

  getPublicPath(compilation: Compilation) {
    const webpackPublicPath = compilation.getAssetPath(
      compilation.outputOptions.publicPath as string,
      { hash: compilation.hash }
    );

    let publicPath =
      webpackPublicPath !== "auto"
        ? webpackPublicPath
        : path
            .relative(
              path.resolve(compilation.options.output.path as string),
              compilation.options.output.path as string
            )
            .split(path.sep)
            .join("/");

    if (publicPath.length && !publicPath.endsWith("/")) {
      publicPath += "/";
    }


    return publicPath;
  }

  apply(compiler: Compiler) {
    const {
      webpack: { sources, Compilation },
    } = compiler;
    const { RawSource } = sources;

    compiler.hooks.thisCompilation.tap("WebpackSvgStore", (compilation) => {
      this.options.publicPath = this.getPublicPath(compilation);

      compilation.dependencyFactories.set(ConstDependency, new NullFactory());
      compilation.dependencyTemplates.set(
        ConstDependency,
        new ConstDependency.Template()
      );

      this.createTaskContext();

      compilation.hooks.processAssets.tap(
        {
          name: "WebpackSvgStore",
          stage: Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
        },
        () => {
          Object.keys(this.tasks).map(async (key) => {
            this.tasks[key].forEach((task) => {
              compilation.emitAsset(
                task.fileName,
                new RawSource(task.fileContent)
              );
            });
          });
        }
      );
    });

    compiler.hooks.done.tap("WebpackSvgStore", () => {
      this.tasks = {};
    });
  }
}

export = WebpackSvgStore;
