const svgXHR = (filename: string) => {
  let baseUrl = undefined;

  if (!filename) return false;
  let _ajax = new XMLHttpRequest();
  let _fullPath;

  if (typeof baseUrl === "undefined") {
    if (typeof window.baseUrl !== "undefined") {
      baseUrl = window.baseUrl;
    } else {
      baseUrl =
        window.location.protocol +
        "//" +
        window.location.hostname +
        (window.location.port ? ":" + window.location.port : "");
    }
  }

  _fullPath = `${baseUrl}/${filename}`.replace(/([^:]\/)\/+/g, "$1");
  _ajax.open("GET", _fullPath, true);
  _ajax.onprogress = () => {};
  _ajax.onload = () => {
    if (!_ajax.responseText) {
      throw Error("Invalid SVG Store Response");
    }
    if (_ajax.status < 200 || _ajax.status >= 300) {
      return;
    }
    const div = document.createElement("div");
    div.innerHTML = _ajax.responseText;
    div.style.display = "none";

    domready(() => {
      document.body.insertBefore(div, document.body.childNodes[0]);
    });
  };
  _ajax.send();
};

/**
 * jQuery like $.ready function.
 *
 * @param {Function} fn
 * @return void
 */
function domready(callback: () => void) {
  if (document.readyState !== "loading") {
    callback();
  } else {
    document.addEventListener("DOMContentLoaded", callback);
  }
}

export default svgXHR;
